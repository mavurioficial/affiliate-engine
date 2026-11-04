#!/usr/bin/env python3
"""One-off Telegram access check; 3 messages max, read-only, no logs of content."""
import argparse,getpass,json,os,re,sys
from pathlib import Path
from urllib.parse import urlsplit
HOSTS={"meli.la":"mercadolivre","merc.li":"mercadolivre","mercadolivre.com.br":"mercadolivre","www.mercadolivre.com.br":"mercadolivre","link.amazon":"amazon","amzn.to":"amazon","a.co":"amazon","www.amazon.com.br":"amazon","amazon.com.br":"amazon"}
URL_PATTERN=re.compile(r"https?://[^\s<>\"'()\[\]]+",re.I)
def classify_urls(text):
    names=[]
    for found in URL_PATTERN.finditer(text):
        try:
            u=urlsplit(found.group(0).rstrip(",.;!?…"))
            if u.scheme=="https" and not u.username and not u.password and u.port in (None,443) and u.hostname in HOSTS:
                names.append(HOSTS[u.hostname])
        except ValueError:
            pass
    return names
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--group",default="GRUPOTABUGADO")
    ap.add_argument("--limit",type=int,default=3)
    opts=ap.parse_args()
    group=opts.group.strip().lstrip("@").lower()
    if group!="grupotabugado" or not 1<=opts.limit<=3:
        ap.error("This pilot is restricted to @GRUPOTABUGADO and at most 3 messages.")
    try:
        from telethon.sync import TelegramClient
        from telethon.errors import FloodWaitError
    except ImportError:
        print("Install telethon==1.45.0 in a Python virtual environment",file=sys.stderr)
        return 2
    try:
        api_id=int(os.environ.get("TELEGRAM_API_ID") or input("Your Telegram API ID: ").strip())
        api_hash=os.environ.get("TELEGRAM_API_HASH") or getpass.getpass("Your Telegram API hash: ")
        if api_id<1 or not re.fullmatch(r"[a-fA-F0-9]{32}",api_hash):raise ValueError("Invalid API ID/hash")
    except (ValueError,EOFError) as exc:
        print("Configuration error: "+str(exc),file=sys.stderr);return 2
    directory=Path.home()/".config"/"mavuri"/"telegram-readonly"
    directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(directory,0o700)
    try:
        client=TelegramClient(str(directory/"user"),api_id,api_hash,receive_updates=False,flood_sleep_threshold=0,device_model="Mavuri access diagnostic",app_version="0.1-readonly")
        with client.start(phone=lambda:input("Phone +55...: ").strip(),code_callback=lambda:getpass.getpass("Telegram login code: ").strip(),password=lambda:getpass.getpass("2FA password (if requested): ")):
            # Confirm already joined: never automatically join groups.
            dialog=next((d for d in client.get_dialogs(limit=None) if str(getattr(d.entity,"username","") or "").lower()==group),None)
            if not dialog:
                print(json.dumps({"access_check":"group_not_found_in_joined_dialogs","messages_inspected":0,"posted":False}))
                return 3
            recent=client.get_messages(dialog.entity,limit=opts.limit)
            counts={"amazon":0,"mercadolivre":0}
            matches=0
            for msg in recent:
                retailers=classify_urls(str(getattr(msg,"raw_text","") or ""))
                if retailers:matches+=1
                for r in retailers:counts[r]+=1
            print(json.dumps({"access_check":"joined_group_read_ok","group":"@"+group,"messages_inspected":len(recent),"messages_with_retailer_links":matches,"retailer_link_counts":counts,"messages_saved":False,"sent_to_supabase":False,"posted":False,"one_shot_only":True},ensure_ascii=False,indent=2))
            return 0
    except FloodWaitError as exc:
        print(f"Flood wait: {exc.seconds}s (do not retry early)",file=sys.stderr);return 4
    except KeyboardInterrupt:return 130
    except Exception as exc:
        print("Diagnostic failed: "+type(exc).__name__,file=sys.stderr);return 5
    finally:
        for f in directory.glob("user.session*"):
            if f.is_file():os.chmod(f,0o600)
if __name__=="__main__":
    sys.exit(main())
