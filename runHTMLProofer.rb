require "html-proofer"

options = {
    ignore_urls: [
        /[\S]*fiverr.com[\S]*/,
        /[\S]*linkedin.com[\S]*/,
        /[\S]*guillemriambau.com[\S]*/,
        /[\S]*archive.md[\S]*/
    ],
    cache: {
        timeframe: {
            external: "2w"
        }
    }
}

HTMLProofer.check_directory("./_site", options).run