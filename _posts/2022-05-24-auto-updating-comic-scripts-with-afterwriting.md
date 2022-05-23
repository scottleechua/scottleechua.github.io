---
layout: post
title:  Auto-updating comic scripts with 'afterwriting
date:   2022-05-24
description: A plaintext walkthrough of writing, revising, and sharing auto-updating comic scripts using Fountain, 'afterwriting, and GitHub Actions.
---

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/comic-script-diagram.png" alt="web architecture diagram explained below">

---
## Why this stack?

I write comic scripts in [Fountain](https://fountain.io), an open-format filetype for scripts and screenplays, and export to PDF when sharing script drafts with the artist I work with. 

Previously, each new draft would result in a sheepish email to the artist, asking them to please ignore the previous draft and see bullet points below for the summary of changes. This was untenable.

I wanted a workflow that enables the artist to:
1. inspect the **exact, line-by-line edits** between any two drafts; and
2. access the **latest version** of the script in PDF,

while I write and overwrite the same single file all throughout (i.e., none of [this](https://phdcomics.com/comics.php?f=1531)).

The workflow I settled on is straightforward: I push my comic scripts to GitHub, and use ['afterwriting](https://afterwriting.com/), an open-source Fountain-to-PDF converter, to convert them to PDF at the time of commit.

(1) is possible because Fountain files are plaintext, and thus compatible with GitHub's compare (`diff`) feature. (2) is possible because 'afterwriting has a command line interface that can be automated with [GitHub Actions](https://github.com/features/actions).

---

## What is Fountain?
I write my comic scripts in Fountain, a formatting convention for writing scriptlike documents. Here is a comic script written in Fountain:

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