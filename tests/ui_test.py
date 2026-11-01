"""UI-тест в headless Chrome на экране Android 360×780.
Запуск: python3 tests/ui_test.py [путь_для_скриншотов]
Проверяет: отсутствие ошибок JS, отсутствие горизонтального скролла, размеры касаний,
все экраны открываются, ключевые сценарии и восстановление после перезагрузки."""
import sys, os, threading, http.server, socketserver, functools, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
Handler = functools.partial(Quiet, directory=ROOT)
class Q(socketserver.TCPServer): allow_reuse_address = True
httpd = Q(('127.0.0.1', 0), Handler); port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f'http://localhost:{port}/index.html'

errors, fails, passed = [], [], []
def check(name, cond, extra=''):
    (passed if cond else fails).append(name + (' — ' + extra if extra and not cond else ''))
    print(('  ✓ ' if cond else '  ✗ ') + name + ('' if cond else ' ' + extra))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 360, 'height': 780}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ru-RU')
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_timeout(600)

    def overflow():
        return pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
    def small_targets():
        return pg.evaluate('''[...document.querySelectorAll('button,input,[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<43.5||r.width<43.5)}).map(e=>(e.textContent||e.getAttribute('aria-label')||e.className).trim().slice(0,30))''')
    def click(sel):
        pg.locator(sel).first.click(); pg.wait_for_timeout(250)
    def close_sheets(n=6):
        for _ in range(n):
            if pg.locator('.sheet-wrap').count() == 0: return
            btn = pg.locator('.sheet [data-a="sheetClose"], .sheet [data-a="evChoose"]:not([aria-disabled])').first
            if btn.count(): btn.click(); pg.wait_for_timeout(200)
            else: return
    def shot(name): pg.screenshot(path=os.path.join(OUT, name + '.png'), full_page=False)

    # 1. Приветствие
    check('приветствие при первом запуске', pg.locator('.sheet [data-a="startGame"]').count() == 1)
    shot('01-welcome')
    pg.fill('#wName', 'Тестер'); click('[data-a="startGame"]')
    check('имя героя применено', pg.evaluate('SN.state.hero.name') == 'Тестер' and 'ТЕСТЕР' in pg.inner_text('.eyebrow').upper())
    shot('02-home'); pg.screenshot(path=os.path.join(OUT, '02-home-full.png'), full_page=True)
    check('нет горизонтального скролла на главном', not overflow())
    st = small_targets(); check('все касания ≥ 44px на главном', not st, str(st[:6]))

    # 2. Сценарий: работа → еда → отдых
    money0 = pg.evaluate('SN.state.money')
    click('[data-a="quick"][data-x="work"]'); close_sheets()
    money1 = pg.evaluate('SN.state.money')
    check('кнопка «Работать» приносит деньги', money1 > money0, f'{money0}→{money1}')
    click('[data-a="quick"][data-x="eat"]'); close_sheets()
    check('кнопка «Поесть» работает', pg.evaluate('SN.state.c.meals') >= 1)
    click('[data-a="sleepSheet"]'); shot('03-sleep-sheet')
    click('.sheet [data-a="sleep"][data-x="street"]'); pg.wait_for_timeout(300)
    shot('04-day-summary-or-home')
    close_sheets(10)
    check('сон сдвигает время', pg.evaluate('SN.state.c.sleeps') == 1)

    # 3. Обход всех экранов
    routes = ['city', 'career', 'people', 'more', 'housing', 'biz', 'fin', 'transport', 'hero', 'inventory', 'quests', 'ach', 'journal', 'stats', 'modes', 'settings', 'help',
              'cat:food', 'cat:health', 'cat:fun', 'cat:skills', 'cat:docs', 'district:old', 'district:center', 'district:business', 'npc:nina', 'career:study', 'career:skills', 'people:love', 'passive', 'shop', 'talents', 'auto', 'rich']
    bad = []
    for r in routes:
        pg.evaluate(f'SN.UI.go({json.dumps(r)})'); pg.wait_for_timeout(120)
        txt = pg.inner_text('#content')
        if 'Ошибка экрана' in txt or len(txt) < 40: bad.append(r)
        if overflow(): bad.append(r + ':overflow')
        sm = small_targets()
        if sm: bad.append(r + ':small' + str(sm[:3]))
        if r in ('city', 'career', 'people', 'biz', 'fin', 'hero', 'quests', 'npc:nina', 'modes', 'more', 'passive', 'shop', 'talents', 'auto', 'rich', 'career:skills'): shot('10-' + r.replace(':', '-'))
    check('все ' + str(len(routes)) + ' экранов открываются без ошибок, без переполнения и мелких кнопок', not bad, str(bad))

    # 4. Документы через диалог Нины Петровны
    pg.evaluate("SN.state.time = (SN.T.day(SN.state)) * 1440 + 10*60; SN.state.district='old'; SN.UI.go('npc:nina')")
    pg.wait_for_timeout(150)
    click('[data-a="talk"][data-x="nina"]'); shot('11-dialog')
    check('диалог открыт', pg.locator('.sheet .bubble').count() >= 1)
    click('.sheet [data-a="dlg"]'); pg.wait_for_timeout(150)
    ref = pg.locator('.sheet [data-a="dlg"]', has_text='направление')
    check('после знакомства появляется просьба о направлении', ref.count() == 1)
    if ref.count(): ref.first.click(); pg.wait_for_timeout(150)
    check('флаг направления', pg.evaluate('!!SN.state.flags.ninaReferral'))
    close_sheets()

    # 5. Собеседование
    pg.evaluate("Object.assign(SN.state.docs,{passport:true}); SN.state.sk.physical=20; SN.state.time = SN.T.day(SN.state)*1440 + 8*60; SN.state.flags.iv_loader=0; SN.UI.go('career')")
    pg.wait_for_timeout(150)
    click('[data-a="apply"][data-x="loader"]'); shot('12-interview')
    click('.sheet [data-a="ivAns"]'); click('.sheet [data-a="ivAns"]')
    check('собеседование показывает шанс', '%' in pg.inner_text('.sheet'))
    click('.sheet [data-a="ivGo"]'); shot('13-interview-result'); close_sheets()

    # 6. Бизнес и финансы
    pg.evaluate("Object.assign(SN.state.docs,{ip:true}); SN.state.account=true; SN.state.money=60000; SN.UI.go('biz')")
    pg.wait_for_timeout(150)
    click('[data-a="bizOpen"][data-x="drinks"]'); click('.sheet [data-a="confirmYes"]'); close_sheets()
    check('бизнес открыт', pg.evaluate('SN.state.biz.length') == 1)
    click('[data-a="bizSet"][data-y="staff:1"]')
    check('персонал нанят', pg.evaluate('SN.state.biz[0].staff') == 1)
    shot('14-biz')
    pg.evaluate("SN.UI.go('fin')"); pg.wait_for_timeout(100)
    click('[data-a="amount"][data-x="toBank"]'); click('.sheet [data-a="amSet"]'); click('.sheet [data-a="amGo"]')
    check('деньги внесены на счёт', pg.evaluate('SN.state.bank') > 0)
    shot('15-fin')

    # 7. Рыбалка (мини-игра)
    pg.evaluate("SN.state.items.push('rod'); SN.state.district='embankment'; SN.state.time = SN.T.day(SN.state)*1440 + 9*60; SN.state.st.energy=90; SN.UI.go('cat:fun')")
    pg.wait_for_timeout(100)
    click('[data-a="act"][data-x="fishing"]'); pg.wait_for_timeout(400)
    check('мини-игра открыта', pg.locator('.fish-bar').count() == 1)
    shot('16-fishing')
    for _ in range(3): click('.sheet [data-a="fishHook"]')
    check('мини-игра завершается', pg.locator('.fish-bar').count() == 0)
    close_sheets()

    # 7б. Финансы: вкладки, биржа
    pg.evaluate("SN.state.bank = 2000000; SN.UI.go('fin')"); pg.wait_for_timeout(150)
    bad2 = []
    for tab in ['overview', 'save', 'credit', 'invest', 'ins']:
        click(f'[data-a="finTab"][data-x="{tab}"]')
        if overflow(): bad2.append(tab + ':overflow')
        sm = small_targets()
        if sm: bad2.append(tab + ':small' + str(sm[:3]))
        if tab == 'invest' and pg.locator('[data-a="openBroker"]').count(): click('[data-a="openBroker"]')
        shot('18-fin-' + tab)
    check('вкладки финансов без переполнения', not bad2, str(bad2))
    click('[data-a="finTab"][data-x="invest"]'); click('[data-a="amount"][data-x="stock:GRBK"]'); click('.sheet [data-a="amGo"]')
    check('акции куплены через интерфейс', pg.evaluate("(SN.state.fin.port.GRBK||{q:0}).q") > 0)
    # 7в. Активы
    pg.evaluate("SN.UI.go('passive')"); pg.wait_for_timeout(100)
    click('[data-a="passiveTab"][data-x="machine"]'); click('[data-a="buyAsset"][data-x="vending"]'); click('.sheet [data-a="confirmYes"]')
    check('доходный актив куплен', pg.evaluate("SN.state.passive.length") == 1)
    # 7г. Автопилот: неделя
    pg.evaluate("SN.UI.go('home')"); pg.wait_for_timeout(100)
    day0 = pg.evaluate('SN.T.day(SN.state)')
    click('[data-a="live"][data-x="7"]'); pg.wait_for_timeout(500); shot('19-autopilot-run')
    pg.wait_for_selector('.sheet [data-a="sheetClose"]', timeout=20000); pg.wait_for_timeout(300); shot('20-autopilot-summary')
    check('автопилот прожил неделю', pg.evaluate('SN.T.day(SN.state)') - day0 >= 7)
    close_sheets(10)
    pg.evaluate("SN.UI.go('home')"); pg.wait_for_timeout(300); shot('21-home-after')
    pg.screenshot(path=os.path.join(OUT, '21-home-full.png'), full_page=True)

    # 8. Сохранение → перезагрузка → восстановление
    snap = pg.evaluate('JSON.stringify({m:SN.state.money,b:SN.state.bank,t:SN.state.time,biz:SN.state.biz.length,name:SN.state.hero.name})')
    pg.reload(); pg.wait_for_timeout(600)
    snap2 = pg.evaluate('JSON.stringify({m:SN.state.money,b:SN.state.bank,t:SN.state.time,biz:SN.state.biz.length,name:SN.state.hero.name})')
    check('прогресс восстановлен после перезагрузки', snap == snap2, snap + ' vs ' + snap2)
    check('приветствие не повторяется', pg.locator('[data-a="startGame"]').count() == 0)

    # 9. Ночь и погода: вид сцены вне улицы
    pg.evaluate("SN.state.housing='room'; SN.state.district='sleeping'; SN.state.wear='business'; SN.state.clothes.push('business'); SN.state.time = SN.T.day(SN.state)*1440 + 22*60; SN.state.weather={temp:-4,kind:'snow',day:SN.T.day(SN.state)}; SN.UI.go('home')")
    pg.wait_for_timeout(250); shot('17-home-night-snow')

    # 10. Сервис-воркер
    pg.wait_for_timeout(800)
    sw = pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")
    check('service worker зарегистрирован на localhost', sw)

    real_errors = [e for e in errors if 'favicon' not in e]
    check('нет ошибок JavaScript в консоли', not real_errors, str(real_errors[:5]))
    b.close()
httpd.shutdown()
print(f'\nUI: {len(passed)} пройдено, {len(fails)} провалено')
sys.exit(1 if fails else 0)
