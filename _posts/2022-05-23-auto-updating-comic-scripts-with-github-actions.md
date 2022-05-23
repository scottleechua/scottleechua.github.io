---
layout: post
title:  Auto-updating comic scripts with GitHub Actions
date:   2022-05-23
description: A plaintext walkthrough The benefits of open source. A plaintext walkthrough of deploying an almost-free, fully self-hosted blog using Ghost, Caddy, Cloudflare, Mailgun, and GCP.
---

---
## What is Fountain?
I write my comic scripts in [Fountain](https://fountain.io), a formatting convention for writing scriptlike documents. Here is a comic script written in Fountain:

```
# Page 1

.Panel 1

It's dark. A coffee cup in the foreground. In midground, ALYSSA on the phone.

ALYSSA
*Uh-huh...*
```

Like [Markdown](https://www.markdownguide.org/basic-syntax/), Fountain files are nothing more than plaintext. Unlike Final Draft, Word, or Google Doc files, which require costly [^1] and proprietary software to view and edit, `.fountain` files can be read and edited on any computer.

While plaintext Fountain already looks "script-like," free conversion software can parse the special characters and formatting rules (e.g., section headings begin with `#`; character names are in all caps) to produce a nicely-rendered PDF:

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/comic-script-exported-pdf.png" alt="formatted version of plaintext above">




[^1]: While Google Docs is technically free, a stable internet connection is not.