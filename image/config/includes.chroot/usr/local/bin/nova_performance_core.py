#!/usr/bin/env python3
"""NOVA Performance Center: observations and explicitly requested safe actions.

No fan control, overclock, permanent CPU governor edits, root execution, or process killing.
"""
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import psutil

PROFILES=('power-saver','balanced','performance')
CONFIG_NAME='performance.json'


def normalize_millidegrees(value):
    """Convert Linux thermal millidegrees to Celsius; reject invalid readings."""
    try: value=float(value)/1000.0
    except (TypeError,ValueError,OverflowError): return None
    return round(value,1) if math.isfinite(value) and 1 <= value <= 125 else None


def valid_celsius(value):
    try: value=float(value)
    except (TypeError,ValueError,OverflowError): return None
    return round(value,1) if math.isfinite(value) and 1 <= value <= 125 else None


def thermal_observations(reader=None, base=Path('/sys/class/thermal')):
    """Use psutil sensors, fallback to kernel thermal zones; never write sysfs."""
    readings=[]
    if reader is None:
        try: sensors=psutil.sensors_temperatures(fahrenheit=False)
        except (AttributeError,OSError,RuntimeError): sensors={}
    else: sensors=reader
    for group, entries in sensors.items():
        for entry in entries:
            val=valid_celsius(entry.current)
            if val is not None:
                readings.append((f'{group} / {entry.label or "датчик"}',val))
    if not readings:
        for path in sorted(base.glob('thermal_zone*')):
            try:
                val=normalize_millidegrees(path.joinpath('temp').read_text().strip())
                kind=path.joinpath('type').read_text().strip()
                if val is not None: readings.append((kind or path.name,val))
            except OSError: pass
    return sorted(readings,key=lambda pair:pair[1],reverse=True)[:30]


def parse_profile_list(output):
    names=[]
    for line in output.splitlines():
        found=re.match(r'\s*\*?\s*(power-saver|balanced|performance)\s*:',line)
        if found and found.group(1) not in names: names.append(found.group(1))
    return names


def run_fixed(args, timeout=3):
    try:
        p=subprocess.run(args, text=True,capture_output=True,timeout=timeout,check=False)
        return p.returncode,(p.stdout or '').strip(),(p.stderr or '').strip()
    except (OSError,subprocess.TimeoutExpired) as error:
        return -1,'',str(error)


def supported_profiles():
    if not shutil.which('powerprofilesctl'): return []
    status,out,_=run_fixed(['powerprofilesctl','list'])
    return parse_profile_list(out) if status==0 else []


def current_profile():
    if not shutil.which('powerprofilesctl'): return None
    status,out,_=run_fixed(['powerprofilesctl','get'])
    return out if status==0 and out in PROFILES else None


def set_profile(profile):
    """Use system D-Bus policy; no bypass, root or edited sysfs."""
    if profile not in PROFILES: return False,'Неверный профиль'
    if profile not in supported_profiles(): return False,'Профиль не поддерживается или служба недоступна'
    status,out,error=run_fixed(['powerprofilesctl','set',profile],timeout=7)
    return status==0,(out or error or 'OK')[:400]


def gpu_snapshot():
    if not shutil.which('nvidia-smi'): return 'GPU: встроенная графика / NVIDIA: метрики недоступны'
    query='name,temperature.gpu,utilization.gpu,memory.used,memory.total'
    status,out,_=run_fixed(['nvidia-smi',f'--query-gpu={query}','--format=csv,noheader,nounits'],timeout=2)
    if status!=0 or not out: return 'GPU NVIDIA: телеметрия недоступна'
    return ('NVIDIA: '+out.splitlines()[0])[:240]


def snapshot(cpu_sampler=None, thermals=None, processes=None):
    """Read-only system sampling, no invasive benchmarking."""
    cpu=(cpu_sampler or (lambda:psutil.cpu_percent(interval=None)))()
    mem=psutil.virtual_memory()
    swap=psutil.swap_memory()
    try: battery=psutil.sensors_battery()
    except (AttributeError,OSError): battery=None
    try: freq=psutil.cpu_freq()
    except (AttributeError,OSError): freq=None
    temps=thermal_observations() if thermals is None else thermals
    return {
        'cpu':round(cpu,1), 'ram':round(mem.percent,1),'ram_used_gib':round(mem.used/1024**3,1),
        'ram_total_gib':round(mem.total/1024**3,1),'swap':round(swap.percent,1),
        'battery':None if battery is None else round(battery.percent,1),
        'plugged':None if battery is None else battery.power_plugged,
        'frequency_mhz':None if freq is None else round(freq.current),
        'thermals':temps,
        'profile':current_profile(),
        'processes':top_processes() if processes is None else processes,
    }


def top_processes(limit=25, iterator=None):
    """Show only useful process metadata; no implicit changes to processes."""
    result=[]
    iterable=iterator if iterator is not None else psutil.process_iter(['pid','name','cpu_percent','memory_percent','username','create_time'])
    for proc in iterable:
        try:
            item=proc.info.copy()
            if item.get('pid') and item.get('pid') != os.getpid(): result.append(item)
        except (psutil.NoSuchProcess,psutil.AccessDenied,psutil.ZombieProcess,AttributeError): pass
    result.sort(key=lambda entry:(entry.get('cpu_percent') or 0,entry.get('memory_percent') or 0),reverse=True)
    return result[:limit]


def lower_priority(proc,expected_creation,real_uid=None):
    """Only reduce scheduling priority of same-user PID, protecting against PID reuse."""
    uid=os.getuid() if real_uid is None else real_uid
    try:
        if proc.pid in (1,os.getpid()): return False,'Системный или текущий процесс'
        if proc.uids().real != uid: return False,'Процесс принадлежит другому пользователю'
        if abs(proc.create_time()-float(expected_creation)) > 0.0001: return False,'PID переиспользован, действие отменено'
        value=proc.nice()
        if not isinstance(value,int) or value>=19: return False,'Приоритет уже минимальный'
        proc.nice(min(19,max(value,0)+5))
        return True,'Приоритет фонового процесса понижен'
    except (psutil.AccessDenied,psutil.NoSuchProcess,psutil.ZombieProcess,OSError,ValueError) as exc:
        return False,str(exc)


def settings_path(base=None):
    return (Path(base) if base is not None else Path.home()/'.config/nova')/CONFIG_NAME


def read_threshold(base=None):
    try:
        obj=json.loads(settings_path(base).read_text(encoding='utf-8'))
        val=obj.get('warning_celsius')
        return val if type(val) is int and 65 <= val <= 105 else 90
    except (OSError,ValueError,TypeError,AttributeError): return 90


def write_threshold(number,base=None):
    if type(number) is not int or not 65 <= number <= 105: raise ValueError('Range 65–105°C')
    target=settings_path(base)
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    os.chmod(target.parent,0o700)
    # Atomic write prevents partial settings on abrupt shutdown.
    fd,temp=tempfile.mkstemp(prefix='.nova-performance-',dir=target.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as file:
            json.dump({'warning_celsius':number},file,ensure_ascii=False)
            file.write('\n')
        os.chmod(temp,0o600)
        os.replace(temp,target)
    finally:
        if os.path.exists(temp): os.unlink(temp)
    return target
