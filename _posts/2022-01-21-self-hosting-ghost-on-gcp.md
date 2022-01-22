---
layout: post
title:  Self-hosting Ghost on Google Cloud Platform
date:   2022-01-21
<!-- description: A comprehensive walkthrough. -->
---

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/ghost-gcp-diagram.png" alt="web architecture diagram which is explained below">

[I'm sold on this stack, bring me to the guide!](#overview)

---

## Why this stack?

I recently helped a friend migrate his movie review blog off [Wix's free tier](https://support.wix.com/en/article/free-vs-premium-site) and onto a [Ghost](https://ghost.org/) blog self-hosted on [Google Cloud Platform](https://cloud.google.com/) (GCP). He was looking for

1. the ability to use a custom domain without an additional fee;
2. a visual, rich-text content editor;
3. a user-friendly website control panel accessible from mobile; and
4. a plug-and-play email newsletter feature

**for free, or as close to free as possible.**

Requirement (1) ruled out other "as-a-service" website builders, while (2), (3), and (4) together ruled out my go-to [Jekyll](https://jekyllrb.com/) + [GitHub Pages](https://pages.github.com/) combo. In the end, I settled on the stack shown in the diagram above. A brief overview of why I chose each component:

- **Blog engine.** I chose [Ghost](https://ghost.org/) as it has a beautiful content editor and a mobile-friendly control panel. While Ghost (the company) offers managed hosting plans for a fee, Ghost (the blog engine) is open-source and free to self-host.
- **Web server.** I chose [Caddy](https://caddyserver.com) as the web server instead of the default [Nginx](https://www.nginx.com/) because Caddy enforces HTTPS right out of the box. While it's certainly possible to enforce HTTPS on Nginx [using certbot and cron jobs](https://www.nginx.com/blog/using-free-ssltls-certificates-from-lets-encrypt-with-nginx/), Caddy abstracts away literally [everything to do with HTTPS](https://caddyserver.com/docs/automatic-https), and I find it's just that much easier to use.
- **Hosting server.** I chose to use a [Compute Engine](https://cloud.google.com/compute) virtual machine to host the website, because GCP has a unique [Always Free Tier](https://cloud.google.com/free/docs/gcp-free-tier/#compute) (distinct from their free trial period) with resources enough to permanently host a small- to medium-sized blog (1GB RAM, 1GB monthly traffic to all regions except China and Australia). GCP usually charges for static external IP addresses, but these are also free when attached to Free Tier virtual machines.
- **Domain registrar.** I like to buy my domain names through [Namecheap](https://namecheap.com) because they're transparent with their prices and don't fill your cart with upsells.
- **Content delivery network (CDN).** I use [Cloudflare](https://cloudflare.com)'s free CDN service to shorten website loading times and protect against [DDOS](https://www.cloudflare.com/learning/ddos/what-is-a-ddos-attack/) attacks. I also prefer managing DNS records through Cloudflare (rather than at the domain registrar level); not only is [domain resolution](https://www.cloudflare.com/learning/dns/what-is-dns/) faster, the user interface is also sleeker.
- **Mail provider.** Ghost has a built-in newsletter feature that integrates most easily with [Mailgun](https://mailgun.com). I'm not too familiar with mail providers, but Mailgun has been great so far, consistently sending emails to inbox, not spam. The first 1,250 emails every month are [free](https://help.mailgun.com/hc/en-us/articles/360048661093-How-does-PAYG-billing-work), and 0.80 USD / thousand emails thereafter.

I tried to come up with a tech stack that was **as low-cost as a self-hosted website could possibly be.** In the diagram above, the only cost for certain is the annual domain name rental fee; everything else is either totally free (Caddy, Ghost) or free with usage limits (GCP, Cloudflare, Mailgun).

## Overview

In this guide, I walk through the whole process of setting up **each and every part** of this exact stack. The guide is divided into four stages:

1. [Setting up GCP](#1-setting-up-gcp)
2. [Configuring the domain](#2-configuring-the-domain)
3. Deploying Ghost and Caddy
4. Configuring Ghost

The whole thing takes 1-2 hours depending on your comfort level with the various technologies.

*Note: For configuration instructions below, change `highlighted values` and leave all other fields at default values.*

### 1. Setting up GCP

#### Initializing GCP
1. Log in to the Google account you want to use with GCP. Make a GCP account [here](https://console.cloud.google.com).
2. Select `Create Project`:
    - Project name: `ghost-blog`
    - Location: `No organization`
3. In the floating topbar, `Activate` Free Trial. You'll be asked to set up a billing account and put your card details on file.
4. (Optional) In the floating topbar, `Activate` a paid account. I prefer to do this immediately for two reasons. One, everything you've set up today will be deleted unless you remember to upgrade *before* the free trial ends; and two, the resources we're using today should stay within the bounds of the Always Free tier anyway.
5. Go to Billing > Budgets & alerts > `Create Budget`:
    - Name: `ghost-blog-budget`
    - Time range: `Monthly`
    - Budget type: `Specified amount`
    - Target amount: `2.00` (as cost should be zero, anyway)
    - Manage notifications: `Email alerts to billing admins and users`

#### Initializing Compute Engine
1. Go to Compute Engine > `Enable API`.
2. (Optional) If asked to `Create Credentials`, do so:
    - Data accessing: `Application Data`
    - `Yes, I'm using Compute Engine.`    
3. Go to Instance Templates > `Create Instance Template`:
    - Name: `free-web-server`
    - Machine family: `General-purpose`
    - Series: `E2`
    - Machine type: `e2-micro (2vCPU, 1GB memory)`
    - Boot disk:
        - Operating system: `Ubuntu`(or any Linux OS of your choice)
        - Version: `Ubuntu 20.04 LTS`
        - Boot disk type: `Standard persistent disk`
    - Firewall:
        - `Allow HTTP traffic`
        - `Allow HTTPS traffic`
4. Go to VM instances > `Create an instance`:
    - New VM Instance from template: `free-web-server`
    - Name: `ghost-blog`
    - Region: `us-west1` (or any region on the [Always Free Tier](https://cloud.google.com/free/docs/gcp-free-tier/#compute))
    - Security:
        - `Turn on Secure Boot`
        - `Turn on vTPM`
        - `Turn on Integrity Monitoring`
5. Go to Snapshots > `Create Snapshot Schedule`:
    - Name: `weekly-backup-schedule`
    - Schedule location: `us-west1` (the same region as your instance)
    - Snapshot storage location: `Regional`
        - Location: `us-west1`
    - Schedule frequency: Weekly
    - `Enable application consistent snapshot`
6. Go to Disks > `ghost-blog` > `Edit`:
    - Snapshot schedule: `weekly-backup-schedule`

#### Initialize VPC Network
1. Go to VPC network > Firewall > `Create Firewall Rule`:
    - Name: `allow-outgoing-2525`
    - Logs: `Off`
    - Direction: `Egress`
    - Action on match: `Allow`
    - Targets: `All instances in the network`
    - Destination filter:
        - `IPv4 ranges`
        - Destination ranges: `0.0.0.0/0`
    - Protocols and ports:
        - `Specified protocols and ports`
        - `tcp`: `2525`
2. Go to External IP addresses > `Reserve Static Address`:
    - Name: `ghost-blog-ip`
    - Network service tier: `Standard`
    - Region: `us-west1` (the same region as your instance)
    - Attached to: `ghost-blog`

### 2. Configuring the domain


{% highlight c++ linenos %}

int main(int argc, char const \*argv[])
{
    string myString;

    cout << "input a string: ";
    getline(cin, myString);
    int length = myString.length();

    char charArray = new char * [length];

    charArray = myString;
    for(int i = 0; i < length; ++i){
        cout << charArray[i] << " ";
    }

    return 0;
}
{% endhighlight %}