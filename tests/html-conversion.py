#!/usr/bin/env python3
"""Optional Chromium-based test for the real plainFromHtml function."""
from pathlib import Path
from playwright.sync_api import sync_playwright
studio=Path(__file__).resolve().parent.parent.joinpath('admin.html').read_text(encoding='utf-8')
start=studio.index('  function plainFromHtml(html){')
end=studio.index('  function current(){',start)
fn=studio[start:end]
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page()
    page.set_content('<!doctype html><html><body></body></html>')
    result=page.evaluate('''code=>Function(code+'; return plainFromHtml;')()(
      '<p>πρώτη<br>δεύτερη</p><blockquote><p>τρίτη</p><p>τέταρτη</p></blockquote><hr>')''',fn)
    assert result == 'πρώτη\nδεύτερη\n\nτρίτη\n\nτέταρτη\n\n***',repr(result)
    browser.close()
print('PASS real plainFromHtml br / blockquote / hr in Chromium')
