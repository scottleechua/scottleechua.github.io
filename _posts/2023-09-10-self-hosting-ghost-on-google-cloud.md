---
layout: post
title:  Self-hosting Ghost on Google Cloud
date:   2023-09-10
description: A plaintext walkthrough of deploying an almost-free, fully self-hosted Ghost blog on Google Cloud.
categories: walkthrough, website, cloud
og_image: ghost-google-cloud-diagram.png
twitter_large_image: true
---

<img class="img-fluid rounded" src="{{ site.baseurl }}/assets/img/ghost-google-cloud-diagram.png" alt="A flowchart. Engine X web server and ghost blog engine. A right directed arrow toward a grey box entitled google cloud. Inside the grey box, compute engine. Right directed arrow. Static IP address. Right directed arrow. Cloud flare content delivery network. From above the grey box, name cheap, domain registrar. Below directed arrow. Static IP address. From above cloud flare, mail provider mail gun. Below directed arrow. Cloud flare, content delivery network. Right directed arrow. Blog and newsletter.">

[I'm sold on this stack, jump to the walkthrough!](#overview)

---

## Why this stack?

I recently helped a friend migrate his movie review blog off [Wix's free tier](https://support.wix.com/en/article/free-vs-premium-site) and onto a [Ghost](https://ghost.org/) blog self-hosted on [Google Cloud](https://cloud.google.com/). He was looking for

1. the ability to use a custom domain without an additional fee;
2. a visual, rich-text content editor;
3. a user-friendly website control panel accessible from mobile; and
4. a plug-and-play email newsletter feature

**for free, or as close to free as possible.**

Requirement (1) ruled out other "as-a-service" website builders, while (2), (3), and (4) together ruled out my go-to [Jekyll](https://jekyllrb.com/) + [GitHub Pages](https://pages.github.com/) combo. In the end, I settled on the stack shown in the diagram above. A brief overview of why I chose each component:

- **Blog engine.** I chose [Ghost](https://ghost.org/) as it has a beautiful content editor and a mobile-friendly control panel. While Ghost (the company) offers managed hosting plans for a fee, Ghost (the blog engine) is open-source and free to self-host.
- **Web server.** I chose [NGINX](https://www.nginx.com/) as it is Ghost's default option, and I went with the path of least resistance and most documentation. (In the previous version of this walkthrough, I chose [Caddy](https://caddyserver.com/) as it seemed less arcane, but replicating the custom setup proved irksome after [the breaking changes](#changelog) in Ghost v5.0.)
- **Hosting server.** I chose to use a [Compute Engine](https://cloud.google.com/compute) virtual machine to host the website, because Google Cloud has a unique [Always Free Tier](https://cloud.google.com/free/docs/free-cloud-features#compute) (distinct from their free trial period) with resources enough to permanently host a small- to medium-sized blog (1GB RAM, 1GB monthly traffic to all regions except China and Australia). Google Cloud usually charges for static external IP addresses, but these are also free when attached to Free Tier virtual machines.
- **Domain registrar.** I like to buy my domain names through [Namecheap](https://namecheap.com) because they're transparent with their prices and don't fill your cart with upsells.
- **Content delivery network (CDN).** I use [Cloudflare](https://cloudflare.com)'s free CDN service to shorten website loading times and protect against [DDOS](https://www.cloudflare.com/learning/ddos/what-is-a-ddos-attack/) attacks. I also prefer managing DNS records through Cloudflare (rather than at the domain registrar level); not only is [domain resolution](https://www.cloudflare.com/learning/dns/what-is-dns/) faster, the user interface is also sleeker.
- **Mail provider.** Ghost has a built-in newsletter feature that integrates most easily with [Mailgun](https://mailgun.com). I'm not too familiar with mail providers, but Mailgun has been great so far, consistently sending emails to inbox, not spam. The first 1,250 emails every month are [free](https://help.mailgun.com/hc/en-us/articles/360048661093-How-does-PAYG-billing-work), and 0.80 USD / thousand emails thereafter. (Ghost also uses Mailgun to send password reset emails, so it's a good idea to set Mailgun up even if you won't be sending out newsletters.)

I tried to come up with a tech stack that was **as low-cost as a self-hosted website could possibly be.** In the diagram above, the only cost for certain is the annual domain name rental fee; everything else is either totally free (Ghost, NGINX, MySQL) or free with usage limits (Google Cloud, Cloudflare, Mailgun).

## Overview

In this walkthrough, I outline the whole process of setting up **each and every part** of this exact stack, in six steps:

1. [Set up Google Cloud](#1-set-up-google-cloud)
2. [Configure the domain](#2-configure-the-domain)
3. [Deploy Ghost](#3-deploy-ghost)
4. [Configure Ghost](#4-configure-ghost)
5. [Finish Cloudflare configuration](#5-finish-cloudflare-configuration)
6. [Create maintenance scripts](#6-create-maintenance-scripts)

The whole thing takes 1-2 hours depending on your comfort level with the various technologies.

*Note: To follow along with the configuration instructions below, edit the `highlighted values` and leave all other fields at default values.*

### 1. Set up Google Cloud

#### Initialize account
1. Log in to the Google account you want to use with Google Cloud, then activate Google Cloud [here](https://console.cloud.google.com).
2. Select `Create Project`:
   - Project name: `ghost-blog`
   - Location: `No organization`
3. In the floating topbar, `Activate` Free Trial. Set up a billing account.
4. *(Optional)* In the floating topbar, `Activate` a paid account. I prefer to do this immediately for two reasons. One, everything you've set up today will be deleted unless you remember to upgrade *before* the free trial ends; and two, the resources created in this walkthrough should stay within the bounds of the Always Free tier anyway.
5. Go to Billing > Budgets & alerts > `Create Budget`:
   - Name: `ghost-blog-budget`
   - Time range: `Monthly`
   - Budget type: `Specified amount`
   - Target amount: `2.00` (in SGD)
   - Manage notifications: `Email alerts to billing admins and users`

#### Initialize Compute Engine
1. Go to Compute Engine > `Enable API`. If asked to `Create Credentials`, enter:
   - Data accessing: `Application Data`
   - `Yes, I'm using Compute Engine`    
2. Go to Instance Templates > `Create Instance Template`:
   - Name: `free-web-server`
   - Machine family: `General-purpose`
   - Series: `E2`
   - Machine type: `e2-micro (2vCPU, 1GB memory)`
   - Boot disk:
      - Operating system: `Ubuntu`
      - Version: `Ubuntu 22.04 LTS`
      - Boot disk type: `Standard persistent disk`
   - Firewall:
      - `Allow HTTP traffic`
      - `Allow HTTPS traffic`
   - Advanced Options > Networking > `Network tags`:
      - Type `mail` then press `Enter`
   - Security:
      - Turn on `Secure Boot`, `vTPM`, and `Integrity Monitoring`
3. Go to VM instances > `Create an instance`:
   - New VM Instance from template: `free-web-server`
   - Name: `ghost-blog`
   - Region: `us-west1` (or any region on the [Always Free Tier](https://cloud.google.com/free/docs/free-cloud-features#compute))
4. Go to Snapshots > `Create Snapshot Schedule`:
   - Name: `weekly-backup-schedule`
   - Schedule location: `us-west1` (the same region as your instance)
   - Snapshot storage location: `Regional`
      - Location: `us-west1`
   - Schedule frequency: `Weekly`
5. Go to Disks > `ghost-blog` > `Edit`:
   - Snapshot schedule: `weekly-backup-schedule`

#### Initialize VPC Network
1. Go to VPC network > Firewall > `Create Firewall Rule`:
   - Name: `allow-outgoing-2525`
   - Logs: `Off`
   - Direction: `Egress`
   - Action on match: `Allow`
   - Targets: `Specified target tags` > `mail`
   - Destination filter: `IPv4 ranges` > `0.0.0.0/0`
   - Protocols and ports: `Specified protocols and ports` > `TCP`: `2525`
2. Go to IP addresses > `Reserve External Static Address`:
   - Name: `ghost-blog-ip`
   - Network service tier: `Standard`
   - Region: `us-west1` (the same region as your instance)
   - Attached to: `ghost-blog`
3. Take note of the External IP address assigned to your instance.

### 2. Configure the domain

#### Buy a domain and set up Cloudflare
1. Make a [Namecheap account](https://www.namecheap.com/myaccount/signup/) and buy your domain. I'll use `ghostblog.com` as an example. Going forward, everywhere you see `ghostblog.com`, replace it with your own domain name. 
2. Make a [Cloudflare account](https://dash.cloudflare.com/sign-up?lang=en-US) and add your domain under the Free subscription plan.
3. Under "Review your DNS records", first **delete all the records**.
4. Then `Add record`:
   - Type: `A`
   - Name: `@`
   - IPv4 address: your external IP address
   - Proxy status: `DNS only`
   - `Save` > `Continue` > `Confirm`.
5. Go back to Namecheap > ghostblog.com > Manage > Nameservers > `Custom DNS` and input the specified Cloudflare nameservers.
6. Go back to Cloudflare > `Done, check nameservers`.
7. Select Overview > Advanced Actions (in the right sidebar) > `Pause Cloudflare on site` while finishing setup.

#### Set up Mailgun
1. Make a [Mailgun account](https://signup.mailgun.com/new/signup) under the `Foundation Trial` plan. You'll be asked to confirm a phone number and put your card details on file.
2. Select `Add a custom domain`:
   - Domain name: `ghostblog.com`
   - Domain region: `US` (unless your website requires within-`EU` data processing)
3. Go back to Cloudflare > ghostblog.com > `DNS` and add the five DNS records Mailgun requires. Turn Proxy Status off (i.e., set all to `DNS only`).
4. Go back to Mailgun > `Verify DNS settings`.
5. Once the custom domain has been added to Mailgun, go to Sending > Domain Settings > `SMTP Credentials`. Take note of the "login" (usually `postmaster@ghostblog.com`).
6. Click `Manage SMTP Credentials`, then `Reset password` > `Reset password` > `Copy`. Paste this password somewhere safe---it will only be generated this once!
7. Click on your profile in the upper right > `API Keys`, and take note of the Private API Key.

### 3. Deploy Ghost

#### Set up VM instance
1. Go back to Google Cloud > Compute Engine > VM Instances > ghost-blog > `SSH`. A virtual terminal ("cloud shell") will appear in a pop-up window.

2. First, set a password for the root user:

   ```bash
   sudo passwd
   ```

3. Switch to root user and authenticate:

   ```bash
   su
   ```

4. Update Linux:

   ```bash
   apt update && apt -y upgrade
   ```

5. To allow any updated services to restart, go back to Google Cloud, `Stop` and `Resume` the instance, then `SSH` again.

6. Make a new user called `service_account` and grant it sudo:

   ```bash
   adduser service_account && usermod -aG sudo service_account
   ```

   Set a password for `service_account`. Leave all user information fields for `service_account` at default values. Confirm with `Y`.

7. Switch to `service_account`:

   ```bash
   su - service_account
   ```

#### Install Ghost dependencies
1. Install Nginx and open the firewall:

   ```bash
   sudo apt install -y nginx && sudo ufw allow 'Nginx Full'
   ```

2. Install [NodeJS](https://github.com/nodesource/distributions#installation-instructions):

   ```bash
   sudo apt update
   sudo apt install -y ca-certificates curl gnupg
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
   NODE_MAJOR=18
   echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
   sudo apt update
   sudo apt install nodejs -y
   sudo npm install -g npm@latest
   ```

3. Install MySQL:

   ```bash
   sudo apt install -y mysql-server
   ```

4. Clean up:

   ```bash
   sudo apt -y autoremove
   ```

5. Stop the `snapd` process to save on RAM:

   ```bash
   sudo systemctl stop snapd.service
   ```

6. Start MySQL in modified mode:

   ```bash
   sudo systemctl set-environment MYSQLD_OPTS="--skip-networking --skip-grant-tables"
   sudo systemctl start mysql.service
   sudo mysql -u root
   ```

   This will load the MySQL command line. Enter:

   ```sql
   flush privileges;
   USE mysql;
   ALTER USER 'root'@'localhost' identified BY 'yourpasswordhere';
   quit;
   ```

   replacing `yourpasswordhere` with your chosen MySQL root password.
   
7. Restart MySQL and switch to production mode. Run:

   ```bash
   sudo systemctl unset-environment MYSQLD_OPTS
   sudo systemctl revert mysql
   sudo killall -u mysql
   sudo systemctl restart mysql.service
   sudo mysql_secure_installation
   ```

   then configure as follows:
   - Install validate password component? —`N`
   - Remove anonymous users? — `Y`
   - Disallow root login remotely? — `N`
   - Remove test database and its privileges? — `Y`
   - Reload privilege tables? — `Y`

8. Turning off MySQL's performance schema is [a common way to reduce its memory usage](https://www.riccardofeingold.com/how-to-reduce-ram-usage-of-ghost-and-mysql/), which occasionally tests the limits of the free tier machine's 1GB of RAM. To do this, open the MySQL configuration file:

   ```bash
   sudo nano /etc/mysql/my.cnf
   ```

   then add the following lines at the bottom of the file:
   
   ```
   [mysqld]
   performance_schema=0
   ```

   then `Ctrl-X` > `Y` > `Enter` to save and quit.

9. Restart MySQL and log in:

   ```bash
   sudo /etc/init.d/mysql restart
   sudo mysql -u root -p
   ```

   Then in the MySQL command line, run:

   ```sql
   show variables like 'performance_schema';
   ```

   Verify that the `performance_schema` variable is indeed `OFF`, then

   ```sql
   quit;
   ```

#### Set up Ghost

1. Install Ghost CLI:

   ```bash
   sudo npm install ghost-cli@latest -g
   ```

2. Make a new directory called `ghost`, set its permissions, then navigate to it:

   ```bash
   sudo mkdir /var/www/ghost
   sudo chown service_account:service_account /var/www/ghost
   sudo chmod 775 /var/www/ghost
   ```

3. Navigate to the website folder and install Ghost:

   ```bash
   cd /var/www/ghost && ghost install
   ```

   then configure as follows:
   - Blog URL: `https://ghostblog.com`
   - MySQL hostname: `localhost`
   - MySQL username: `root`
   - MySQL password: the password you set for `root`
   - Ghost database name: `ghost_prod`
   - Set up Ghost MySQL user? — `Y`
   - Set up NGINX? — `Y`
   - Set up SSL? — `Y`, then enter your email
   - Set up systemd? — `Y`
   - Start Ghost? — `Y`
    
   If you entered a value wrong, interrupt with `Ctrl + C` then run `ghost setup`.

4. If MySQL is still giving errors, run:

   ```bash
   sudo mysql
   ```

   then in the MySQL command line:

   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'yourpasswordhere';
   quit;
   ```

   then run:

   ```bash
   ghost start
   ```

#### Set up Mailgun on Ghost

1. While still inside `/var/www/ghost`, run:

   ```bash
   sudo nano config.production.json
   ```

   and update the `"mail"` section as follows, using spaces (**not** tabs) to indent:

   ```json
   "mail": {
     "transport": "SMTP",
     "options": {
       "service": "Mailgun",
       "host": "smtp.mailgun.org",
       "port": "2525",
       "secure": false,
       "auth": {
         "user": "your-mailgun-username",
         "pass": "your-mailgun-password"
       }
     }
   },
   ```

   replacing `"your-mailgun-username"` and `"your-mailgun-password"` with your Mailgun SMTP credentials.
    
   If you chose to set up your Mailgun in the EU, set `"host"` to `"smtp.eu.mailgun.org"` instead.

2. Restart Ghost for the config to take effect:

   ```bash
   ghost restart
   ```

### 4. Configure Ghost
1. Go to `https://ghostblog.com/ghost`. Create your admin login credentials.
2. Customize your site > the "gear" icon > Email newsletter > `Mailgun configuration`:
   - Mailgun region: `US` (unless you previously chose `EU`)
   - Mailgun domain: `ghostblog.com`
   - Mailgun Private API key: paste it here.

   Then click `Save` in the upper-right corner.

### 5. Finish Cloudflare configuration
1. Go back to Cloudflare. If you had previously `Paused` Cloudflare, go back to Advanced Actions > `Enable Cloudflare on site`.
2. Go to ghostblog.com > DNS > `Add record`:
   - Type: `A`
   - Name: `www.ghostblog.com`
   - IPv4 address: your Google Cloud external IP address
   - Proxy status: `Proxied`
3. `Edit` the other A record to change Proxy status to `Proxied`.
4. Go to ghostblog.com > SSL/TLS > Overview and change SSL/TLS encryption mode to `Full`.

### 6. Create maintenance scripts

#### Enable Ghost auto-start

Sometimes virtual machines restart by themselves. Create this cron job so that whenever the virtual machine restarts, Ghost does, too.

1. From the home directory of `service_account`, run:

   ```bash
   crontab -e
   ```

   and press `1` to select Nano as your text editor.

2. Paste the following into the cronfile:

   ```
   @reboot cd /var/www/ghost && /usr/bin/ghost start
   ```

#### Create update script

Create a single bash script that updates Ghost and all its dependencies.

1. Create an update script in the home directory of `service_account`:

   ```bash
   cd && sudo nano update-ghost.sh
   ```

2. Paste the following text into the update script:

   ```bash
   #!/bin/bash

   sudo apt update && sudo apt -y upgrade
   sudo apt clean && sudo apt autoclean && sudo apt autoremove
   sudo npm install -g npm@latest
   cd /var/www/ghost
   sudo npm install -g ghost-cli@latest
   sudo find ./ ! -path "./versions/*" -type f -exec chmod 664 {} \;
   ghost backup
   ghost stop
   ghost update
   ghost ls
   ```

3. Make it executable:

   ```bash
   sudo chown service_account:service_account update-ghost.sh
   sudo chmod 775 update-ghost.sh
   ```

4. Now every time you want to update Ghost in the future, `SSH` to the virtual machine, then

   ```bash
   su - service_account
   ./update-ghost.sh
   ```

   Note that `ghost backup` requires your Ghost admin credentials.

### Congratulations!
At this point you should have a working self-hosted Ghost blog. Updates aside, you should be working from the `https://ghostblog.com/ghost` control panel from now on.

---

## Contribute
This walkthrough last worked for me in **September 2023**. If you spot errors, vulnerabilities, or potential improvements, please do [open a pull request](https://github.com/scottleechua/scottleechua.github.io/blob/source/_posts/2023-09-10-self-hosting-ghost-on-google-cloud.md) on this blog post!

## Changelog

- **2023-09-10**: Update Nodejs installation instructions to install v18, [as recommended by Ghost](https://ghost.org/docs/faq/node-versions/).

- **2023-08-10**: Add cron job to auto-start Ghost upon VM restart. Thanks to [Daniel Raffel](https://blog.danielraffel.me/) for the contribution!

- **2023-08-06**: Revise instructions to set MySQL root password. Thanks to [Shehroz Alam on Linuxhint](https://linuxhint.com/change-mysql-root-password-ubuntu/).

- **2023-05**: Add update Ghost CLI command to `update-ghost.sh`.

- **2023-03**: Replace SQLite with MySQL, Caddy with NGINX, and Docker with [Ghost CLI](https://ghost.org/docs/ghost-cli/). Add update script for easier maintenance.

   Ghost v5.0+ [introduced a breaking change](https://ghost.org/docs/changes): it would drop support for all databases except MySQL 8.
   
   Consequently, the previous setup instructions broke. Months after v5.0, the unofficial Ghost Docker images were still configured for SQLite3, and I didn't have the bandwidth to figure out how MySQL factored in to the Docker setup. When I learned that Ghost installed via the Ghost CLI could take care of SSL certificate renewals, I was more than happy to bring this walkthrough closer to the official Ghost [installation instructions for Ubuntu](https://ghost.org/docs/install/ubuntu/) and its recommended stack.
   
   Later, after I got the CLI-based installation working, I considered recreating this setup using a Dockerfile. But MySQL uses much more RAM than SQLite, occasionally hitting the 1GB ceiling during relatively intensive operations, such as sending out newsletters. Adding Docker back into the mix would likely consume even more memory.

   The updated version of this walkthrough draws from Ghost's [official documentation](https://ghost.org/docs/install/ubuntu/) and Norbert Hunyadi's [Mailgun config snippet](https://bironthemes.com/blog/ghost-mailgun-config/). Curiositry's [tutorial](https://www.autodidacts.io/host-ghost-mysql8-on-fly-io-free-tier/) on hosting Ghost on [Fly.io](https://fly.io/)'s free tier and Cyberjunky's [Ghost v5.0 + Caddy walkthrough](https://cyberjunky.nl/hosting-a-ghost-blog-on-google-cloud/) were also immensely helpful, though I didn't go in those directions in the end.

- **2022-01**: Initial post. This walkthrough owes a debt of gratitude to The Applied Architect's [Ghost on Google Cloud tutorial](https://theappliedarchitect.com/setup-a-free-self-hosted-blog-in-under-15-minutes/) and Brian Burroughs' [Ghost + Caddy tutorial](https://techroads.org/building-a-caddy-container-stack-for-easy-https-with-docker-and-ghost/), which helped me piece together the deployment process.