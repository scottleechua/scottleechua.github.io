#!/usr/bin/env bash

curl 'https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/refs/heads/main/robots.txt' > robots-list.txt
{
    head -n 18 robots.txt
    cat robots-list.txt
} > tmp.txt
echo '' >> tmp.txt
echo 'Sitemap: https://scottleechua.com/sitemap.xml' >> tmp.txt
mv tmp.txt robots.txt
rm robots-list.txt