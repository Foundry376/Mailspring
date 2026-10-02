# Seeds fake open-tracking / link-tracking metadata onto real sent messages in the dev mailbox
# so the Activity views have something to show. Run from ~/Library/Application Support/Mailspring-dev
# with the app AND its mailsync processes stopped (pkill -f "app/mailsync --mode sync"), after
# backing up edgehill.db. Edit the account addresses and link URLs below.
import json, random, sqlite3, re, time
random.seed(376)
db = sqlite3.connect('edgehill.db')
db.execute('PRAGMA journal_mode=WAL')
rows = db.execute("""
  select id, accountId, date, data from Message
  where draft=0 and id not like 'deleted-%'
    and date > strftime('%s','now')-120*86400
    and json_extract(data,'$.from[0].email') in ('bengotow@gmail.com','ben@foundry376.onmicrosoft.com')
    and json_array_length(json_extract(data,'$.to'))>0
  order by date desc limit 40""").fetchall()

now = int(time.time())
LINKS = ['https://getmailspring.com/pro', 'https://calendly.com/bengotow/30min', 'https://foundry376.com/pricing', 'https://github.com/Foundry376/Mailspring']
touched = 0
for mid, aid, date, data in rows:
    d = json.loads(data)
    recipients = [c['email'] for c in d.get('to', []) + d.get('cc', [])]
    sent = int(date)
    horizon = min(now, sent + 21*86400)
    def when():
        return random.randint(sent + 120, max(sent + 121, horizon))
    opens = []
    for r in recipients:
        for _ in range(random.choice([0, 1, 1, 2, 3, 5])):
            opens.append({'recipient': r, 'timestamp': when()})
    opens.sort(key=lambda e: e['timestamp'])
    links = []
    for i, url in enumerate(random.sample(LINKS, random.choice([1, 2]))):
        clicks = [{'recipient': r, 'timestamp': when()} for r in recipients for _ in range(random.choice([0, 0, 1, 2]))]
        clicks.sort(key=lambda e: e['timestamp'])
        links.append({'url': url, 'redirect_url': f'https://link.getmailspring.com/link/{d.get("hMsgId","x")}/{i}?redirect={url}',
                      'click_count': len(clicks), 'click_data': clicks})
    meta = [m for m in d.get('metadata', []) if m.get('pluginId') not in ('open-tracking', 'link-tracking')]
    meta.append({'__cls': 'PluginMetadata', 'pluginId': 'open-tracking', 'v': 2,
                 'value': {'uid': d.get('hMsgId'), 'open_count': len(opens), 'open_data': opens}})
    meta.append({'__cls': 'PluginMetadata', 'pluginId': 'link-tracking', 'v': 2,
                 'value': {'uid': d.get('hMsgId'), 'tracked': True, 'links': links}})
    d['metadata'] = meta
    db.execute('update Message set data=? where id=?', (json.dumps(d), mid))
    for plugin in ('open-tracking', 'link-tracking'):
        db.execute('insert or replace into ModelPluginMetadata (id, accountId, objectType, value, expiration) values (?,?,?,?,NULL)', (mid, aid, 'Message', plugin))
    touched += 1
db.commit()
print('updated', touched, 'messages')
print(db.execute("select count(*) from ModelPluginMetadata where value in ('open-tracking','link-tracking')").fetchone())
