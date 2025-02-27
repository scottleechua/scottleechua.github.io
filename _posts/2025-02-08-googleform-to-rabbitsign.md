---
layout: post
title: Sending customized documents for e-signature using RabbitSign and Google Forms
last_updated: 2025-02-08
description: A plaintext guide to integrating Google Forms with RabbitSign using an Apps Script.
categories: guide, cloud
og_image: googleform-to-rabbitsign-diagram.png
twitter_large_image: true
---

<img class="img-fluid rounded" src="/assets/img/googleform-to-rabbitsign-diagram.png" alt="A flowchart. Google Forms. Right directed arrow. Apps Script. An arrow from below. Secret Manager. Right directed arrow. RabbitSign, e-signature platform.">

## Try it out now!
See this workflow in action for yourself!

1. Go to [10minutemail](https://10minutemail.net) and get a temporary email address.
2. Fill out this [Superhero Registration Google Form](https://docs.google.com/forms/d/e/1FAIpQLSdRA_m0kYRXReUqKgqyRg-4TF9m3PDkR6jEJLbLIUoBw8ZLdg/viewform?usp=header).
3. Within a few minutes, you should receive a customized Superhero Oath in your temporary mailbox --- sign it and submit!

[I'm sold on this workflow, jump to the tutorial!](#setup)

<img class="img-fluid rounded" src="https://raw.githubusercontent.com/scottleechua/googleform-to-rabbitsign/main/assets/header.jpeg" alt="A digital 'superhero oath' document being prepared in RabbitSign, with fields for names, dates, email, and signature. It also includes a checkbox for joining a group chat and field customization options on the right panel.">

## Why this workflow?

I manage [`read.komiks.space`](https://read.komiks.space), an online space to read Southeast Asian comics. Whenever we onboard a new comic creator, we first sign a license agreement so they can allow us to host their works. Previously, sending out license agreements was a manual, multi-step process:

1. I send them a Google Form to collect their details (name, ID number, biodata, and so on).
2. Once they submit the form, I make a copy of my license agreement template, fill in their responses, and save to PDF.
3. I upload the PDF to [RabbitSign](https://www.rabbitsign.com/index.html)[^1] and send it out for e-signature.

I wanted to remove myself from the picture, so that the instant they submit the Google Form, a personalized license agreement lands in their inbox moments later, ready to be signed. (Hence this workflow!)

The key here is [Google Apps Script](https://developers.google.com/apps-script), an automation scripting platform that integrates very nicely with the Google ecosystem of tools. In particular, we want a script that:

1. gets triggered whenever a specific Google Form is submitted;
2. fills a RabbitSign template document with the relevant form data;[^2] and
3. instantly sends the document out for signing.

In this guide, we'll use [some template code I wrote](https://github.com/scottleechua/googleform-to-rabbitsign) that takes care of a lot of the low-level plumbing for you.

And since we're using Google tools anyway, we'll securely store our RabbitSign API credentials in Google Cloud Secret Manager, where Apps Script can safely retrieve them.

## Cost
This workflow runs for as close to free as possible:
- Google Forms and Apps Script are both free.[^3]
- The RabbitSign API comes with [10 free documents](https://www.rabbitsign.com/developer.html) created via API, and 0.10 USD per document thereafter.
- Google Cloud Secret Manager gives you up to 6 active secrets and 10k access operations for free each month under the [Google Cloud Free Tier](https://cloud.google.com/free/docs/free-cloud-features#secret-manager).

## Setup
This process has four steps:
1. [Set up accounts](#1-set-up-accounts)
2. [Create a RabbitSign template](#2-create-a-rabbitsign-template)
3. [Prepare the Google Form](#3-prepare-the-google-form)
4. [Customize the Apps Script code](#4-customize-the-apps-script-code)

### 1. Set up accounts

#### Get RabbitSign API credentials
1. [Create a RabbitSign account](https://www.rabbitsign.com/index.html) and log in. Then go to the [Developer Console](https://www.rabbitsign.com/user/developer). Accept the terms of service and add a payment method.
2. Under My Developer Keys > `Create Key`. Name it something meaningful like `apps-script-key`.
3. Take note of the Key ID and the Key Secret.

#### Set up Google Cloud
1. Log in to the Google account you want to use with Google Forms. Activate Google Cloud [here](https://console.cloud.google.com).
2. Select `Create Project`:
   - Project name: `googleform-to-rabbitsign`
   - Location: `No organization`
   
   Take note of the **Project ID**.
3. In the floating topbar, `Activate` Free Trial. Set up a billing account.
4. *(Optional)* In the floating topbar, `Activate` a paid account. I prefer to do this immediately, otherwise anything you do now will be deleted unless you remember to upgrade *before* the free trial ends.

#### Create Secret
1. Search for `Secret Manager API`, then `Enable` it.
2. Select `Create Secret` and enter:
    - Name: `rabbitsign-api-secret`
    - Secret value: `{"id":"<APIKEYID>","secret":"<APIKEYSECRET>"}`
    
    replacing `<APIKEYID>` and `<APIKEYSECRET>` with your actual RabbitSign credentials.
3. Confirm `Create Secret`. Now your API credentials have Secret ID: `rabbitsign-api-secret` and Secret Version: `1`.

    In the future, if you rotate API keys, you can `Add new version` to the same Secret. This would keep your Secret ID the same, but increment the Secret Version to `2`.

### 2. Create a RabbitSign template

1. From the [RabbitSign Dashboard](https://www.rabbitsign.com/dashboard), click `Create a template`. Upload your template file as PDF. 
2. Fill in the default title and message, which will become the subject and body of the email RabbitSign sends to your recipient. You can override these default messages later in [Step 4](#4-customize-the-apps-script-code).
3. Tick `Include sender fields`.
4. Enter a value for Role Name, e.g., `Recipient`. Take note of what you entered.
5. With Assignee set to `Sender (Me)`, drag and drop the fields you want to fill using the Google Form responses. RabbitSign calls these "sender fields." Assign each sender field a custom `Field Name`. **Note these down as you won't see them again after this!**
6. With Assignee set to `Recipient`, drag and drop the fields you want the recipient to fill in themselves. In this case, since the recipient will provide their details via Google Form, just a `Signature` field will probably suffice.
7. Select `Create Template`.
8. Go back to the Dashboard > `Templates` > select the template you just created. Take note of the **Template ID**.

<img class="img-fluid rounded" src="/assets/img/googleform-to-rabbitsign-template.png" alt="A flowchart. Google Forms. Right directed arrow. Apps Script. An arrow from below. Secret Manager. Right directed arrow. RabbitSign, e-signature platform.">
<div class="caption">
Sender fields (blue) are labeled with meaningful Field Names. The only Recipient field (green) is a Signature field.
</div>

### 3. Prepare the Google Form

1. Create a [new Google Form](https://forms.new). Go to Settings > Responses > Collect email addresses > `Responder input`.
2. From your Google Form, click the 3-dots icon in the upper right > select `Apps Script`. This creates a new Apps Script project. Give it a meaningful title, as the project will show up as a "Third-party app" in your Google account's [Data and Privacy tab](https://myaccount.google.com/data-and-privacy) later.
3. From Apps Script, go to Project Settings > tick `Show 'appsscript.json' manifest file in editor`.
4. Open the now-visible `appsscript.json` file and add a new entry:
    ```
    "oauthScopes": [
        "https://www.googleapis.com/auth/script.external_request",
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/forms"
    ]
    ```
    remembering to add a comma after the previous argument.
5. Delete `Code.gs`. Copy over `main.gs` and `utils.gs` from [this GitHub repo](https://github.com/scottleechua/googleform-to-rabbitsign).
6. Go to Triggers > `Add Trigger`. Edit the following:
    - Select event type: `On form submit`
    - Failure notification settings: `Immediately`
7. Click `Save`. This should initiate a Google authentication flow to grant the project the necessary permissions. Accept the risks, proceed, and grant all the requested permissions.

### 4. Customize the Apps Script code

While editing `main.gs`, you can refer to [the `demo.gs` file](https://github.com/scottleechua/googleform-to-rabbitsign/blob/main/demo.gs) that powers the [Superhero Registration demo form](https://docs.google.com/forms/d/e/1FAIpQLSdRA_m0kYRXReUqKgqyRg-4TF9m3PDkR6jEJLbLIUoBw8ZLdg/viewform?usp=header). (You won't have to edit anything in `utils.gs`.)

1. Fill in the config values at the top of `main.gs`:
    - PROJECT_ID: the Google Cloud Project ID you noted in [Step 1](#1-set-up-accounts)
    - SECRET_ID: `rabbitsign-api-secret`
    - SECRET_VERSION: `1`
    - TEMPLATE_ID: the RabbitSign template ID you noted in [Step 2](#2-create-a-rabbitsign-template)
    - RECIPIENT_ROLE_NAME: `Recipient`
    - DOCUMENT_TITLE and EMAIL_BODY: the subject and body of the email RabbitSign will send out; this overrides the default values you set earlier in [Step 2](#2-create-a-rabbitsign-template).
2. On line 29, replace `"Name"` with the exact text of the Google Form question that asks for the recipient's name. For example, if the Google Form question reads, "Enter your full name here:", then line 29 should read:

    ```js
    const recipientName = googleFormAnswers["Enter your full name here:"];
    ```

    complete with any capitalization and punctuation used.

3. Uncomment line 33 (Option 1).
4. Below line 39, assign Google Form answers to the corresponding RabbitSign fields. The Google Form answers are contained in the dictionary `googleFormAnswers`, where the keys are the question texts and the values are the responses.

    The goal is to fill up the dictionary `rabbitsignFields`, where the keys are the sender field values you noted in [Step 2](#2-create-a-rabbitsign-template), and the values are as follows:


    | **RabbitSign field type** | **Expected value** | **Notes** |
    |:---:|:---:|---|
    | Text | any string | Also useful for arbitrary calendar dates ("1938-04-18"). |
    | Checkbox | "true" or "false" | Note that these are strings! |
    | Date | "true" | This is just a dummy argument, as RabbitSign dates actually get their value from `payload["date"]`. |
    | Signature and Initials | string | Whatever you type here will show up in cursive as your e-signature, e.g., "Professor X". |

    See [lines 37–43](https://github.com/scottleechua/googleform-to-rabbitsign/blob/main/demo.gs#L37) of `demo.gs` for working examples of each field type.

5. Submit some test responses to the Google Form. Use the Apps Script Execution log to debug. It might help to examine the raw Google Form payloads by forwarding them to tools like [RequestCatcher](https://requestcatcher.com).

### Congratulations!

At this point, you've connected Google Forms to RabbitSign and saved yourself hours of manual form-filling! Your future self thanks you. 🫡

---

### Contribute
This workflow last worked for me as of the most recent date in the changelog below. If you spot errors, vulnerabilities, or potential improvements, please do [open a pull request](https://github.com/scottleechua/scottleechua.github.io/blob/source/_posts/2025-02-08-googleform-to-rabbitsign.md) on this blog post!

## Changelog
- **2025-02-12**: Update RabbitSign API status and pricing.

- **2025-02-08**: Initial post. This workflow owes a deep debt of gratitude to [the RabbitSign team](https://www.rabbitsign.com/team.html) who have created such an elegant, delightful e-signing platform.

---
#### Footnotes

[^1]: I'm a big advocate for [RabbitSign](https://blog.rabbitsign.com/launching-an-unlimited-free-e-signing-service-fe77a50a66aa), a low-cost e-signature platform created by Stanley Zhong that cleverly uses serverless architecture to bring costs as low as possible.

[^2]: While other online form providers let you forward submitted form data elsewhere (e.g., [Typeform webhooks](https://www.typeform.com/developers/webhooks/)), they generally **don't** let you transform the data or modify the HTTP request before sending---which the RabbitSign API requires, and Apps Script lets you do.

[^3]: Apps Script is technically subject to [some quotas and limitations on runtimes](https://developers.google.com/apps-script/guides/services/quotas), but your form would need to be receiving thousands of submissions per day for these to even become an issue.