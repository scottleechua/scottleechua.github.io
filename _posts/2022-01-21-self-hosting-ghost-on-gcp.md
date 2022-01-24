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

1. [Set up GCP](#1-set-up-gcp)
2. [Configure the domain](#2-configure-the-domain)
3. [Deploy Ghost and Caddy](#3-deploy-ghost-and-caddy)
4. [Configure Ghost](#4-configure-ghost)
5. [Finish Cloudflare configuration](#5-finish-cloudflare-configuration)

The whole thing takes 1-2 hours depending on your comfort level with the various technologies.

*Note: To follow along with the configuration instructions below, edit the `highlighted values` and leave all other fields at default values.*

### 1. Set up GCP

#### Initialize GCP
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

#### Initialize Compute Engine
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
        - Operating system: `Ubuntu`
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
3. Take note of the External IP address.

### 2. Configure the domain

#### Buy a domain and set up Cloudflare
1. Make a Namecheap account and buy your domain. I'll use `ghostblog.com` as an example. Going forward, everywhere you see `ghostblog.com`, replace it with your own domain name. 
2. Make a Cloudflare account and add your domain under the Free subscription plan.
3. Under "Review your DNS records", first **delete all** the records.
4. `Add record`:
    - Type: `A`
    - Name: `ghostblog.com`
    - IPv4 address: your GCP external IP address
    - Proxy status: `DNS only`
5. `Save` > `Continue` > `Confirm`.
6. Go back to Namecheap > ghostblog.com > `Manage` > Nameservers > `Custom DNS` and input the specified Cloudflare nameservers.
7. Go back to Cloudflare > `Done, check nameservers`.
8. Go to Cloudflare > ghostblog.com > Overview, then in the right sidebar, Advanced Actions > `Pause Cloudflare on site` while finishing setup.

#### Set up Mailgun
1. Make a Mailgun account under the `Flex Trial` plan. You'll be asked to confirm a phone number and put your card details on file.
2. Select `Add a custom domain`:
    - Domain name: `ghostblog.com`
    - Domain region: `US` (unless your website requires within-`EU` data processing)
3. Go back to Cloudflare > ghostblog.com > DNS and add the five DNS records Mailgun requires. Turn Proxy Status off (i.e., set to `DNS only`).
4. Go back to Mailgun > `Verify DNS settings`.
5. Once the custom domain has been added to Mailgun, go to Sending > Domain Settings > SMTP Credentials. Take note of the "login" (usually `postmaster@ghostblog.com`).
6. Click `Reset password` > `Reset password` > `Copy`. Paste this password somewhere safe---it will only be generated this once!
7. Go to Settings > API Keys, show the Private API Key and copy it somewhere safe.

### 3. Deploy Ghost and Caddy

#### Set up VM
1. Go back to GCP > Compute Engine > VM Instances > ghost-blog > `SSH`. A virtual terminal ("cloud shell") will appear in a pop-up window.
2. First, set a password for the root user:

{% highlight bash %}
sudo passwd
{% endhighlight %}

{:start="3"}
3. Switch to root user:
{% highlight bash %}
su
{% endhighlight %}

{:start="4"}
4. Update Linux:
{% highlight bash %}
apt update
apt upgrade
{% endhighlight %}

#### Install Docker
1. Install dependencies:
{% highlight bash %}
apt install apt-transport-https ca-certificates curl software-properties-common
{% endhighlight %}

{:start="2"}
2. Get Docker GPG key:
{% highlight bash %}
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
{% endhighlight %}

{:start="3"}
3. Download Docker:
{% highlight bash %}
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable"
{% endhighlight %}

{:start="4"}
4. Install Docker:
{% highlight bash %}
sudo apt update
sudo apt-cache policy docker-ce
sudo apt install docker-ce
{% endhighlight %}

{:start="5"}
5. Make a new sudo-eligible user called `service_account`:
{% highlight bash %}
adduser service_account
{% endhighlight %}

{:start="6"}
6. Set a password for `service_account`. Leave the "user information" for `service_account` at default values, and confirm with `Y`.

{:start="7"}
7. Give `service_account` sudo privileges:
{% highlight bash %}
usermod -aG sudo service_account
{% endhighlight %}

{:start="8"}
8. Close this cloud shell window and open a new one.

{:start="9"}
9. Switch to `service_account`:
{% highlight bash %}
su - service_account
{% endhighlight %}

{:start="10"}
10. Allow `service_account` to use Docker:
{% highlight bash %}
sudo usermod -aG docker service_account
{% endhighlight %}

{:start="11"}
11. Verify that Docker works by running:
{% highlight bash %}
docker run hello-world
{% endhighlight %}

{:start="12"}
12. Set Mailgun SMTP credentials as environment variables. First open the bash profile in Vim:
{% highlight bash %}
vi .profile
{% endhighlight %}

{:start="13"}
13. Vim has two modes, "Command Mode" (file is read-only) and "Insert Mode" (file is editable). Press `I` to enter Insert Mode. Add these lines at the bottom of the file, replacing the fields with the Mailgun SMTP credentials you obtained:
{% highlight bash %}
export mail__options__auth__user="postmaster@ghostblog.com"
export mail__options__auth__pass="theSMTPpasswordyoucopied"
{% endhighlight %}

{:start="14"}
14. Press `Esc` to return to "Command Mode". Type `:wq` to save and quit, then press `Enter`.

{:start="15"}
15. Update the profile with:
{% highlight bash %}
source .profile
{% endhighlight %}

{:start="16"}
16. Close this cloud shell window and open a new one.

#### Install Ghost and Caddy

{:start="1"}
1. Switch to `service_account`:
{% highlight bash %}
su - service_account
{% endhighlight %}

{:start="2"}
2. Make a new directory called `ghost` and navigate to it:
{% highlight bash %}
mkdir /home/service_account/ghost
cd ghost
{% endhighlight %}

{:start="3"}
3. If you chose to run Mailgun from the EU, replace `smtp.mailgun.org` with `smtp.eu.mailgun.org`. Other than that, run the below command as is. This will download, configure, and run a Ghost image within Docker:
{% highlight bash %}
docker run -d \
--restart always \
--name ghost-blog \
-v /home/service_account/ghost/content:/var/lib/ghost/content \
-p 2368:2368 \
-e url=https://ghostblog.com \
-e mail__transport="SMTP" \
-e mail__options__host="smtp.mailgun.org" \
-e mail__options__port=2525 \
-e mail__options__auth__user \
-e mail__options__auth__pass \
ghost
{% endhighlight %}

{:start="4"}
4. Run the command below and note the "Container ID" associated with the "ghost" Image:
{% highlight bash %}
docker ps
{% endhighlight %}

{:start="5"}
5. Run the command below, replacing `containerid` with yours. Verify that the environment variables (the `docker run` fields tagged with `-e`) were saved.
{% highlight bash %}
docker exec containerid printenv
{% endhighlight %}

{:start="6"}
6. Create a Caddyfile to store the configuration for the Caddy web server:
{% highlight bash %}
vi Caddyfile
{% endhighlight %}

{:start="7"}
7. In the text below, replace `your@email.com` with your own email. (Caddy uses your email address to procure free SSL certificates from [Let's Encrypt](https://letsencrypt.org/).) Press `I` to enter Insert Mode. Enter the following text manually, using **tabs** to indent lines:
{% highlight bash %}
https://ghostblog.com {
	proxy / ghost-blog:2368 {
		transparent
	}
	tls your@email.com
}
{% endhighlight %}

{:start="8"}
8. Press `Esc` to return to "Command Mode". Type `:wq` to save and quit, then press `Enter`.

{:start="9"}
9. Install Caddy, keying in `Y` when prompted:
{% highlight bash %}
docker run -it \
--restart always \
--link ghost-blog:ghost-blog \
--name caddy \
-p 80:80 \
-p 443:443 \
-v /home/service_account/ghost/Caddyfile:/etc/Caddyfile \
-v /home/service_account/.caddy:/root/.caddy \
abiosoft/caddy
{% endhighlight %}

{:start="10"}
10. Try to visit your domain `https://ghostblog.com`. Sometimes you might need to go back to Cloudflare and `Pause Cloudflare on this site` for a while. Once the webpage connects and displays the default Ghost template, close the cloud shell window. Installation is complete!

### 4. Configure Ghost
1. Go to `https://ghostblog.com/ghost`. Set up your website basic details.
2. Go to Settings (the "gear" icon) > Email newsletter > Email newsletter settings:
    - Mailgun region: whichever you selected previously
    - Mailgun domain: ghostblog.com
    - Mailgun Private API key: the Private API key you took note of
3. Turn `off` "Enable newsletter open-rate analytics".
4. `Save Settings`.
5. (Optional) To disable the hovering "Subscribe" button, go to Membership > `Customize Portal` and disable "Show Portal Button."

### 5. Finish Cloudflare Configuration
1. **After 24 hours or so**, go back to Cloudflare. If you had previously `Paused` Cloudflare, go back to Advanced Actions > `Enable Cloudflare on site`.
2. Go to ghostblog.com > DNS > `Add record`:
    - Type: `A`
    - Name: `www.ghostblog.com`
    - IPv4 address: your GCP external IP address
    - Proxy status: `Proxied`
3. `Edit` the other A record to change Proxy status to `Proxied`.

## Congratulations!
At this point you should have a working self-hosted Ghost blog. The technical setup is over---from now on, you should be working within the `https://ghostblog.com/ghost` control panel instead.

This tutorial owes a debt of gratitude to The Applied Architect's [Ghost on GCP tutorial](https://theappliedarchitect.com/setup-a-free-self-hosted-blog-in-under-15-minutes/) and Brian Burroughs' [Ghost + Caddy tutorial](https://techroads.org/building-a-caddy-container-stack-for-easy-https-with-docker-and-ghost/), which helped me piece together the deployment process in Step 3.