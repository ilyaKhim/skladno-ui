import os
import http.cookiejar
import json
import re
import secrets
import time
import urllib.error
import urllib.request

BASE = os.environ.get('AUTH_BASE_URL', 'http://localhost:3000').rstrip('/')
MAIL = os.environ.get('MAILPIT_URL', 'http://localhost:8025').rstrip('/')
# This diagnostic creates a test account; only run it against local services.
from urllib.parse import urlsplit
if any(urlsplit(url).hostname not in ('localhost', '127.0.0.1', '::1') for url in (BASE, MAIL)):
    raise SystemExit('Auth smoke test only supports local services')
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(jar))

def fetch(url, data=None, headers=None):
    req = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(), headers=headers or {})
    try:
        with client.open(req, timeout=20) as res:
            return res.status, res.read().decode(), dict(res.headers)
    except urllib.error.HTTPError as res:
        return res.code, res.read().decode(), dict(res.headers)

def auth(path, data=None, csrf=True):
    headers = {'Content-Type': 'application/json'}
    if data is not None and csrf:
        status, body, _ = fetch(BASE + '/api/auth/csrf')
        assert status == 200, ('csrf',status,body)
        c = json.loads(body)['data']
        headers[c['headerName']] = c['token']
    status, body, response_headers = fetch(BASE + '/api/auth/' + path, data, headers)
    return status, json.loads(body), response_headers

def message(subject):
    for _ in range(10):
        _, data, _ = fetch(MAIL + '/api/v1/messages')
        messages = json.loads(data)['messages']
        for m in messages:
            if m['Subject'] == subject and any(x['Address'] == email for x in m['To']):
                _, data, _ = fetch(MAIL + '/api/v1/message/' + m['ID'])
                return json.loads(data)['Text']
        time.sleep(.3)
    raise AssertionError('Local email was not delivered')

email = 'smoke-' + secrets.token_hex(5) + '@example.test'
password = secrets.token_urlsafe(20)
status, page, _ = fetch(BASE + '/auth')
# The form hydrates inside Suspense; a plain HTTP client sees the server-rendered shell.
assert status == 200 and 'id="auth-heading"' in page and 'Вход и регистрация' in page, (status, page[:200])
print('PASS frontend auth page serves its server-rendered shell')
assert auth('me')[0] == 401
assert auth('identify', {'email':email}, csrf=False)[0] == 403
assert auth('identify', {'email':email})[1]['data']['step'] == 'create-password'
status, result, _ = auth('register', {'email':email,'password':password,'consentAccepted':True})
assert status == 200, result
assert auth('identify', {'email':email})[1]['data']['step'] == 'verify'
assert auth('resend-code', {'email':email})[0] == 429
code = re.search(r'\b[0-9]{6}\b', message('GoDeck: подтверждение почты')).group()
old_session = next(c.value for c in jar if c.name == 'GODECK_SESSION')
assert auth('verify-email', {'email':email, 'code':code})[1]['data']['signedIn']
new_cookie = next(c for c in jar if c.name == 'GODECK_SESSION')
assert new_cookie.value != old_session
assert new_cookie.has_nonstandard_attr('HttpOnly')
assert new_cookie.get_nonstandard_attr('SameSite') == 'Lax'
assert auth('me')[1]['data']['email'] == email
print('PASS real registration email, code verification, session rotation and cookie flags through Next proxy')
assert auth('sign-out', {})[0] == 200
assert auth('me')[0] == 401
assert auth('sign-in', {'email':email,'password':password})[0] == 200
print('PASS sign out and password sign in')
assert auth('request-password-reset', {'email':email})[0] == 200
reset_body = message('GoDeck: восстановление пароля')
token = re.search(r'#token=([A-Za-z0-9_-]{43})', reset_body).group(1)
assert BASE + '/auth/reset/#token=' in reset_body
status, page, _ = fetch(BASE + '/auth/reset')
assert status == 200 and 'Новый пароль' in page
new_password = secrets.token_urlsafe(20)
assert auth('reset-password', {'token':token, 'password':new_password})[0] == 200
assert auth('me')[0] == 401
assert auth('reset-password', {'token':token, 'password':new_password})[0] == 400
assert auth('sign-in', {'email':email,'password':password})[0] == 401
assert auth('sign-in', {'email':email,'password':new_password})[0] == 200
assert auth('me')[1]['data']['email'] == email
assert auth('sign-out', {})[0] == 200
print('PASS real reset email, reset page, token single use and changed password')
print('HTTP smoke test passed; one local test account and two Mailpit messages created.')
