require "html-proofer"

options = {
    ignore_urls: [
        /[\S]*fiverr.com[\S]*/,
        /[\S]*linkedin.com[\S]*/,
        /[\S]*guillemriambau.com[\S]*/,
        /[\S]*archive.md[\S]*/,
        /[\S]*vimeo.com[\S]*/,
        /[\S]*facebook.com[\S]*/,
        /[\S]*namecheap.com[\S]*/,
        /[\S]*cloudflare.com[\S]*/,
        /[\S]*mailgun.com[\S]*/,
        /[\S]*linuxize.com[\S]*/,
        /[\S]*esquiremag.ph[\S]*/,
        /[\S]*cosmo.ph[\S]*/,
        /[\S]*inquirer.net[\S]*/,
        /[\S]*signalaward.com[\S]*/
    ],
    cache: {
        timeframe: {
            external: "2w"
        }
    }
}

HTMLProofer.check_directory("./_site", options).run