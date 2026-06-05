---
layout: post
title:  Ghost advanced tips
last_updated: 2023-09-10
description: Advanced tips for Ghost blog admins
categories: guide, website, cloud
og_image: ghost-google-cloud-diagram.png
twitter_large_image: true
---

Maintenance scripts
Reducing load time
https://github.com/jochumdev/ghost-jsdelivr
Customizing main.min.js

robots.txt (Cloudflare)

https://ghost.org/docs/config
- portal
- sodosearch
- comments
- privacy

Port must be 2368

https://www.techweirdo.net/how-to-add-cloudflare-with-initial-settings-for-optimization/#%F0%9F%8C%9F-ssl-settings

Sudo install:

https://github.com/ghostboard/ghost-purge-images

sudo chmod -R a+rw content
then run the purge
then ghost doctor to change permissions back



Replacing the default service account
Replace it with one with just monitoring metric writer and logs writer
Remove project editor role