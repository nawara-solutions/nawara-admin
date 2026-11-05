import os,time,json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
options=Options()
for arg in ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--window-size=1440,1100']: options.add_argument(arg)
options.binary_location='/usr/bin/chromium'
d=webdriver.Chrome(service=Service('/usr/bin/chromedriver'),options=options)
d.get('http://127.0.0.1:4200'); time.sleep(2)
d.execute_script("localStorage.setItem('nw.theme','light');localStorage.setItem('nw.accent','sapphire');")
d.refresh();time.sleep(2)
d.execute_script("window.reviewTheme=ng.getComponent(document.querySelector('adm-appearance-menu')).theme;window.reviewLocale=ng.getComponent(document.querySelector('adm-preference-menus')).locale")
d.find_element('css selector','input[type=email]').send_keys('owner@demo.nawara.invalid')
d.find_element('css selector','input[type=password]').send_keys('nawara-demo-2026')
d.find_element('css selector','button[type=submit]').click(); time.sleep(1.5)
d.find_element('css selector','input').send_keys('123456')
d.find_element('css selector','button[type=submit]').click();time.sleep(2)
# Angular router keeps the memory-only demo session alive.
d.execute_script("document.querySelector('a[href=\"/settings\"]').click()")
time.sleep(1)
d.execute_script("document.querySelector('a[href=\"/settings/account\"]').click()")
time.sleep(1)
from selenium.webdriver.common.keys import Keys
from pathlib import Path
out=Path('docs/review/account-settings-workspace'); (out/'screenshots').mkdir(parents=True,exist_ok=True)
results=[]
def section(name):
 d.execute_script("document.querySelector('[data-account-section="+name+"]').click()")
 time.sleep(.15)
def check(label,shot=False):
 data=d.execute_script("""const page=document.querySelector('adm-account-settings-page');const nav=page.querySelector('nav');const content=page.querySelector('.account-settings__content');const rect=nav.getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir,theme:document.documentElement.dataset.theme,accent:document.documentElement.dataset.accent,navDirection:getComputedStyle(nav).flexDirection,navWidth:rect.width,panelCount:page.querySelectorAll('adm-account-profile-panel,adm-account-access-panel,adm-account-security-panel').length,selected:page.querySelector('[aria-current=page]').dataset.accountSection,childOverflow:[...content.querySelectorAll('*')].filter(e=>e.clientWidth>1&&!e.classList.contains('nw-visually-hidden')&&e.scrollWidth>e.clientWidth+2).map(e=>e.tagName+'.'+e.className)}""")
 data['case']=label;results.append(data)
 (out/'browser-results.json').write_text(json.dumps(results,indent=2)+'\n')
 assert data['scrollWidth']<=data['width'],data
 assert data['panelCount']==1,data
 assert not data['childOverflow'],data
 if shot: d.save_screenshot(str(out/'screenshots'/f'{label}.png'))
for lang in ['en','fr','ar']:
 d.execute_async_script("reviewLocale.use(arguments[0]).then(arguments[arguments.length-1])",lang)
 for width in [1920,1440,1280,1024,768,390]:
  d.set_window_size(width,1100);time.sleep(.12)
  for name in ['profile','access','security']:
   section(name);check(f'{lang}-{name}-{width}',True)
d.set_window_size(1440,1100)
d.execute_async_script("reviewLocale.use('en').then(arguments[arguments.length-1])")
for accent in ['coral','rose','plum','indigo','teal','amber','midnight','pearl','sapphire','emerald','burgundy']:
 d.execute_async_script("reviewTheme.setAccent(arguments[0]).then(arguments[arguments.length-1])",accent)
 for theme in ['light','dark']:
  d.execute_script("reviewTheme.setPreference(arguments[0])",theme);time.sleep(.1)
  for name in ['profile','access','security']:
   section(name);check(f'{accent}-{theme}-{name}',(accent,theme) in [('sapphire','light'),('rose','dark'),('pearl','light')])
for scheme in ['light','dark']:
 d.execute_cdp_cmd('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-color-scheme','value':scheme}]})
 d.execute_script("reviewTheme.setPreference('system')");time.sleep(.2);check('system-'+scheme)
d.execute_cdp_cmd('Emulation.setEmulatedMedia',{'features':[]})
d.execute_script("reviewTheme.setPreference('light')")
d.execute_async_script("reviewTheme.setAccent('sapphire').then(arguments[arguments.length-1])")
section('profile');section('access');section('security');d.back();time.sleep(.3)
assert d.find_element('css selector','[aria-current=page][data-account-section=access]')
d.forward();time.sleep(.3);assert d.find_element('css selector','[aria-current=page][data-account-section=security]')
# Native keyboard focus and activation.
link=d.find_element('css selector','[data-account-section=profile]');d.execute_script('arguments[0].focus()',link);link.send_keys(Keys.ENTER);time.sleep(.3)
assert d.find_element('css selector','[aria-current=page][data-account-section=profile]')
outline=d.execute_script("return getComputedStyle(document.activeElement).outlineStyle")
results.append({'case':'history-keyboard','focusOutline':outline})
assert outline!='none'
# Effective CSS viewport at 200% desktop reflow, without changing product CSS.
d.execute_cdp_cmd('Emulation.setDeviceMetricsOverride',{'width':720,'height':550,'deviceScaleFactor':2,'mobile':False})
check('zoom-200-reflow',True)
d.execute_cdp_cmd('Emulation.clearDeviceMetricsOverride',{})
# Direct URL plus refresh preserves query selection; the existing memory-only demo session requires reauthentication.
d.get('http://127.0.0.1:4200/settings/account?section=access');time.sleep(.8);d.refresh();time.sleep(.8)
d.find_element('css selector','input[type=email]').send_keys('owner@demo.nawara.invalid');d.find_element('css selector','input[type=password]').send_keys('nawara-demo-2026');d.find_element('css selector','button[type=submit]').click();time.sleep(1)
d.find_element('css selector','input').send_keys('123456');d.find_element('css selector','button[type=submit]').click();time.sleep(1.5)
results.append({'case':'refresh-return-access','result':'existing memory-only demo session resets; reauthentication redirects to overview','actualUrl':d.current_url})
# Actual operator working-code flow and deterministic multi-platform fixture.
d.get('http://127.0.0.1:4200/login/code');time.sleep(1)
d.find_element('css selector','input').send_keys('operator.multi@demo.nawara.invalid');d.find_element('css selector','button[type=submit]').click();time.sleep(1)
d.find_element('css selector','input').send_keys('042917');d.find_element('css selector','button[type=submit]').click();time.sleep(2)
d.find_element('css selector','a[href^="/platforms/"]').click();time.sleep(1)
d.execute_script("document.querySelector('a[href=\"/settings\"]').click()");time.sleep(.5)
d.execute_script("document.querySelector('a[href=\"/settings/account\"]').click()");time.sleep(.5)
for name in ['profile','access','security']:
 section(name);check('operator-'+name,True)
 if name=='access': assert len(d.find_elements('css selector','[data-platform]'))==2
 if name=='security': assert not d.find_elements('css selector','.account-security__header a')
(out/'browser-results.json').write_text(json.dumps(results,indent=2)+'\n')
print('PASS',len(results),'recorded cases (includes demo refresh limitation); screenshots:',len(list((out/'screenshots').glob('*.png'))))
d.quit()
