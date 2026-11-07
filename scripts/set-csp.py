#!/usr/bin/env python3
from pathlib import Path
import re,hashlib,base64,html
p=Path(__file__).resolve().parent.parent/'admin.html'
s=p.read_text(encoding='utf-8')
s=re.sub(r'<meta\s+http-equiv="Content-Security-Policy"[^>]*>','',s,count=1)
hashes=[]
for match in re.finditer(r'<script(?P<attrs>[^>]*)>(?P<code>.*?)</script>',s,re.S|re.I):
 if re.search(r'\btype\s*=\s*"application/json"',match['attrs']):continue
 if not match['code'].strip():continue
 digest=base64.b64encode(hashlib.sha256(match['code'].encode('utf-8')).digest()).decode('ascii')
 hashes.append("'sha256-"+digest+"'")
policy="default-src 'self'; object-src 'none'; base-uri 'self'; script-src 'self' "+' '.join(hashes)+"; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; connect-src 'self' https://*.workers.dev; frame-src 'self'"
meta='<meta http-equiv="Content-Security-Policy" content="'+html.escape(policy,quote=True)+'">'
s=s.replace('<meta charset="utf-8">','<meta charset="utf-8">'+meta,1)
p.write_text(s,encoding='utf-8')
print('Admin CSP updated: '+str(len(hashes))+' inline script hashes')
