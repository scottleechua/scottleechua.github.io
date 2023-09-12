---
layout: post
title:  Versioning comic scripts using Fountain and GitHub
date:   2023-09-12
description: A plaintext walkthrough of writing and sharing auto-updating comic scripts using Fountain, <i>&#8217;afterwriting</i>, and GitHub Actions.
categories: walkthrough, comics, cloud
og_image: comic-script-diagram.png
twitter_large_image: true
---

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/comic-script-diagram.png" alt="A flowchart. Fountain, working file format. Right directed arrow. A grey box entitled github. Inside the box, after writing, automated file conversion. Right directed arrow. Adobe PDF, output file format.">

[I'm sold on this workflow, jump to the tutorial!](#setup)

---

## Why this workflow?

I write comic scripts in [Fountain](https://fountain.io), an open-format filetype for scripts and screenplays, and export them to PDF to send to my collaborators (artists, coauthors, publishers).

Previously, each new draft would result in a sheepish email to everyone involved, asking them to please ignore the previous draft and see bullet points below for the summary of changes. This was untenable.

I wanted a workflow that enables my collaborators to:
1. inspect the **exact, line-by-line edits** between any two drafts; and
2. access the **latest version** of the script in PDF,

while I write and overwrite the same single file all throughout (i.e., none of [this](https://phdcomics.com/comics.php?f=1531)).

In short, I wanted to implement [version control](https://git-scm.com/book/en/v2/Getting-Started-About-Version-Control).

The workflow I settled on is straightforward: every time I push updated scripts to a [GitHub](https://github.com/) repository, the open-source Fountain converter [<i>&#8217;afterwriting</i>](https://afterwriting.com/) automatically (re)generates the PDF versions of those scripts.

Requirement (1) is satisfied because Fountain files are plaintext, and thus compatible with GitHub's compare (`diff`) feature. Requirement (2) is satisfied because <i>&#8217;afterwriting</i> has a command line interface that can be automated with [GitHub Actions](https://github.com/features/actions).

When all is said and done, the repo looks something like this:

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/comic-script-repo.png" alt="Screenshot of a github repository with two folders and seven files. There are three columns. Column one shows the names of the contents. The two folders are dot github slash workflows, and pdf. The seven files are dot gitignore, readme dot markdown, config dot json, and four dot fountain files labeled K1 through K4. Column two lists the commit messages. Column three shows the commit dates. The header reads, scottleechua and github actions bot, apply automatic changes, twenty hours ago, forty nine commits.">

## Why use Fountain?
Fountain is a formatting convention for writing scriptlike documents. Here is a comic script written in Fountain:

```
# Page 1

.Panel 1

It's dark. A coffee cup in the foreground. In midground, ALYSSA on the phone.

ALYSSA
*Uh-huh...*
```

**Fountain is free.** Like [Markdown](https://www.markdownguide.org/basic-syntax/), Fountain files are **nothing more than plaintext files** saved with a `.fountain` extension. Unlike Final Draft, Word, or Google Doc files, which require costly [^1] and proprietary software to view and edit, `.fountain` files can be read and edited on literally any computer.[^2]

**Fountain is futureproof.** Proprietary software may ~~force~~ strongly encourage you to [upgrade to the latest version](https://store.finaldraft.com/final-draft-12-upgrade.html) or [change your file formats](https://support.microsoft.com/en-us/office/converting-documents-to-a-newer-format-34ec742e-f0f9-4d95-bbe3-3ee8e30a86fa), but your computer will always have a text editor. This makes Fountain ideal for storing scripts without worrying about software obsolescence or incompatibilities.

**Fountain exports to the usual file formats.** While plaintext Fountain already looks rather "script-like," free converter software can parse the special formatting rules[^3] into a nicely-rendered PDF:

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/comic-script-exported-pdf.png" alt="Screenshot containing the formatted version of the comic script above.">

(If you must, Fountain also exports nicely to Final Draft.)

## Setup

1. Make a GitHub account, create a new private repository, and [clone](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) it to your local computer. Let's call this folder `my-script-repo`.
2. Open a text editor.[^4] Create a text file called `.gitignore` in `my-script-repo` containing:
    ```
    .DS_Store
    desktop.ini
    ```
    
3. Move your Fountain script file into `my-script-repo`. Let's call it `script.fountain`.
4. Create a text file called `config.json` in `my-script-repo` containing:
    ```
    {
	    "embolden_scene_headers": true,
	    "show_page_numbers": true,
	    "split_dialogue": true,
	    "print_title_page": true,
	    "print_profile": "a4",
	    "double_space_between_scenes": false,
	    "print_sections": true,
	    "print_synopsis": true,
	    "print_actions": true,
	    "print_headers": true,
	    "print_dialogues": true,
	    "number_sections": false,
	    "use_dual_dialogue": true,
	    "print_notes": true,
	    "print_header": "",
	    "print_footer": "",
	    "print_watermark": "",
	    "scenes_numbers": "none",
	    "each_scene_on_new_page": false
	}
    ```
    This config file customizes the PDF output generated by <i>&#8217;afterwriting</i>. Customize these settings as you like; refer to the [documentation](https://github.com/ifrost/afterwriting-labs/blob/master/docs/clients.md) for a complete list of available settings.

5. Create a subfolder `my-script-repo/pdf`. Inside it, create an empty text file called `.gitkeep`.
6. Add, commit, then push this first set of changes to GitHub. (For help, see [here](https://www.earthdatascience.org/workshops/intro-version-control-git/basic-git-commands/).) At this stage, your folder structure should look like:
    ```
    .
    └── my-script-repo/
        ├── .gitignore
        ├── script.fountain
        ├── config.json
        ├── pdf/
        │   └── .gitkeep
        └── .git/
            └── << ignore these files >>
    ```

7. Go to `my-script-repo` on GitHub. Click on `Actions` > `New Workflow`.
8. Click on Simple Workflow > `Configure`.
9. Rename the file from `blank.yml` to `fountain_to_pdf.yml`. Replace the contents of the text box with:

    ``` yaml
    name: fountain_to_pdf

    on:
      push:
        branches:
          - main
      workflow_dispatch:

    jobs:
      convert_files:
        name: Convert Fountain to PDF
        runs-on: ubuntu-latest
        permissions:
          contents: write
        steps:
          - name: Check out repo
            uses: actions/checkout@v3
            
          - name: Set up Bun package manager
            uses: oven-sh/setup-bun@v1

          - name: Install 'afterwriting
            run: bun install afterwriting -g

          - name: Save PDFs of all Fountain files to '/pdf'
            run: |
              readarray -d '' filepaths< <(find . -name "*.fountain" -print0)
              for filepath in "${filepaths[@]}"
              do
                basename="$(basename -s .fountain $filepath)"
                afterwriting --source "$filepath" --pdf pdf/"$basename".pdf --overwrite --config config.json
              done
          
          - name: Commit changes
            uses: stefanzweifel/git-auto-commit-action@v4

    ```

    This Workflow finds all the Fountain files in your repo (including subdirectories), then saves a PDF version of each file in the `/pdf` folder with the same filename.
    
10. To the upper right of the text box, click `Commit changes` > `Commit changes`.

11. Committing changes should kickstart a run of the Actions Workflow you just created. You can track its progress on GitHub, under `Actions`.

12. Once the Workflow is done, pull the changes to your local and verify that `/pdf` now contains the autogenerated file `script.pdf`.

Setup is complete!

## Use
The workflow in practice looks like this:

1. Edit your scripts on local.

2. Commit changes and push to GitHub.

3. After a minute or so, `git pull`.

If you don't want [merge conflicts](https://happygitwithr.com/pull-tricky.html) (and you don't), **always pull the newly-updated PDFs after every push!**

---

## Congratulations!
At this point, the workflow has been set up and you know how to update your scripts. Now your collaborators can see the latest edits for a given file by clicking on its latest commit:[^5]

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/comic-script-click-commit.png" alt="Screenshot of the same github repository as above, with two folders and seven files. There are three columns. Column one shows the names of the contents. The two folders are dot github slash workflows, and pdf. The seven files are dot gitignore, readme dot markdown, config dot json, and four dot fountain files labeled K1 through K4. Column two lists the commit messages. Column three shows the commit dates. The commit message of file K1 dot fountain is highlighted. It reads, major draft K4, minor drafts K1, K2, K3.">

which leads them to a page with line-by-line comparisons:

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/comic-script-diff.png" alt="Screenshot of the diff file for K1 dot fountain. The commit message reads major draft K4, minor updates K1, K2, K3. Below the commit message, it says, showing 4 changed files, with 218 additions and 205 deletions. Below that, it shows the details of the changes in the file.">

Your collaborators can also view the latest PDFs by viewing the repo on GitHub, or by pulling the latest changes to their local repo.

### Contribute
This walkthrough last worked for me in September 2023. If you spot errors, vulnerabilities, or potential improvements, please do [open a pull request](https://github.com/scottleechua/scottleechua.github.io/blob/source/_posts/2023-09-12-versioning-comic-scripts-using-fountain-and-github.md) on this blog post!

## Changelog

- **2023-09-12**: Update `fountain_to_pdf.yml` to automatically find and convert all Fountain files in the repo. Thanks to [Steven Jay Cohen](https://stevenjaycohen.com/) for the feature request!

- **2022-05-25**: Initial post. This tutorial owes a deep debt of gratitude to Piotr Jamr&oacute;z and the rest of the [<i>&#8217;afterwriting</i>](https://afterwriting.com/) team. (So do I!)

---
#### Footnotes

[^1]: While Google Docs is technically free, a stable internet connection is not.
[^2]: Free Fountain-specific scriptwriting apps with syntax highlighting and other quality-of-life features are also available, such as [Beat](https://kapitan.fi/beat/) (Mac) or [Trelby](https://www.trelby.org/) (Windows, Linux).
[^3]: For instance, section headings begin with `#`; scene headings begin with `.`; character names are in all caps. Read the full syntax guide [here](https://fountain.io/syntax).
[^4]: Every operating system has one by default, e.g., [Notepad](https://apps.microsoft.com/store/detail/9MSMLRH6LZF3?hl=en-us&gl=US) on Windows, [TextEdit](https://support.apple.com/en-ph/guide/textedit/welcome/mac) on Mac.
[^5]: Read the [GitHub documentation](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/viewing-and-comparing-commits/comparing-commits) for more ways to compare commits.