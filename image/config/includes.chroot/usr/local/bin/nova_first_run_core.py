#!/usr/bin/env python3
"""Per-user first-run state; never alters disks or creates root configuration."""
from pathlib import Path
import json
import os
import secrets

def state_path(home=None):
    return Path(home) / '.config/nova/first-run.json' if home else Path.home()/'.config/nova/first-run.json'

def is_complete(home=None):
    try:
        data=json.loads(state_path(home).read_text(encoding='utf-8'))
        return isinstance(data,dict) and data.get('completed') is True
    except (OSError,ValueError):return False

def mark_complete(home=None):
    path=state_path(home);path.parent.mkdir(parents=True,exist_ok=True)
    path.parent.chmod(0o700)
    temp=path.parent/('.first-run-'+secrets.token_hex(8)+'.tmp')
    try:
        fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w',encoding='utf-8') as out:
            json.dump({'completed':True,'schema':1},out)
            out.flush();os.fsync(out.fileno())
        os.replace(temp,path)
    finally:
        temp.unlink(missing_ok=True)
