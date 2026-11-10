require "html-proofer"
require "json"
require "fileutils"
require "nokogiri"
require "stringio"
require "uri"

# Stage 1 of the link checker.
#
# HTMLProofer is fast. But it produces false-positive failures for external hosts
# that block bots (LinkedIn 999, Medium/Cloudflare 403, X 400, rate-limits...).
# Thus this script does two things:
#   * It treats INTERNAL failures (our own pages, images, anchors) as real bugs and
#     fails.
#   * It writes EXTERNAL failures to a JSON file for stage 2 (scripts/verifyLinks.mjs).
#     Stage 2 opens only those URLs again in a real browser to find which links are
#     truly dead.
#
# Links to social sites that always block bots are not requested here at all: they
# answer HTTP libraries with a login wall (200) even for deleted accounts. They go
# straight to stage 2, which opens them in a real browser ("browser"). Bluesky
# profiles also answer 200 for missing accounts; stage 2 looks them up in the
# Bluesky API instead ("bluesky"). Share buttons (tweet / post / share dialogs)
# aren't pages that can go missing, so they aren't checked at all.

BROKEN_EXTERNAL_FILE = "tmp/broken-external-links.json"

# Hosts (and their subdomains) that always block bots.
UNVERIFIABLE_HOSTS = %w[linkedin.com instagram.com facebook.com twitter.com x.com].freeze
UNVERIFIABLE_URL = %r{\Ahttps?://([^/?#]+\.)?(#{UNVERIFIABLE_HOSTS.map { |h| Regexp.escape(h) }.join("|")})(?=[/:?#]|\z)}i
BLUESKY_PROFILE_URL = %r{\Ahttps?://bsky\.app/profile/[^/?#]+}i
SHARE_URL = %r{\Ahttps?://((www\.)?(twitter|x)\.com/intent/|(www\.)?facebook\.com/(dialog|sharer)|bsky\.app/intent/)}i

# How stage 2 should check a link, or nil if stage 1 checks it.
def stage2_check(url)
    return nil if url.match?(SHARE_URL)
    return "bluesky" if url.match?(BLUESKY_PROFILE_URL)
    return "browser" if url.match?(UNVERIFIABLE_URL)
    nil
end

# Browser-like request headers, so fewer hosts reject stage 1 as a bot. The Chrome
# version is read from the installed Chrome, so the user agent stays current.
CHROME = ENV.fetch("CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
chrome_version = begin
    `"#{CHROME}" --version 2>/dev/null`[/\d+/]
rescue SystemCallError
    nil
end
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " \
    "(KHTML, like Gecko) Chrome/#{chrome_version || "140"}.0.0.0 Safari/537.36"

options = {
    ignore_urls: [
        # Not a bot-blocker workaround: this host serves no HTTPS at all (the TLS
        # handshake is reset), so the http:// link in _data/coauthors.yml is correct
        # and HTMLProofer's enforce-https check is a permanent false positive here.
        %r{[\S]*guillemriambau\.com[\S]*},
        # Share buttons, never checked.
        SHARE_URL,
        # Checked by stage 2 instead (see stage2_check).
        UNVERIFIABLE_URL,
        BLUESKY_PROFILE_URL,
    ],
    # Absolute links to this site are checked against _site, not the live site,
    # so a link to a page that no longer exists (or doesn't exist yet) fails.
    swap_urls: {
        %r{\Ahttps?://(www\.)?scottleechua\.com/?\z} => "/",
        %r{\Ahttps?://(www\.)?scottleechua\.com/} => "/",
    },
    typhoeus: {
        headers: {
            "User-Agent" => USER_AGENT,
            "Accept" => "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language" => "en-US,en;q=0.9",
        },
    },
    cache: {
        timeframe: {
            external: "2w"
        }
    }
}

runner = HTMLProofer.check_directory("./_site", options)

# HTMLProofer prints its own report and calls exit(1) when it finds failures. This
# script does its own reporting. Thus it runs HTMLProofer with stdout captured and
# it catches SystemExit. Then it inspects runner.failed_checks directly.
puts "Stage 1: HTMLProofer checking internal + external links..."
captured = StringIO.new
real_stdout = $stdout
real_stderr = $stderr
$stdout = captured
$stderr = captured
begin
    runner.run
rescue SystemExit
    # Failures found. The details are in runner.failed_checks below.
ensure
    $stdout = real_stdout
    $stderr = real_stderr
end

failures = runner.failed_checks
external = failures.select { |f| f.check_name.to_s.include?("External") }
internal = failures - external

# Give external failures to stage 2 (browser re-check).
FileUtils.mkdir_p(File.dirname(BROKEN_EXTERNAL_FILE))
data = external.filter_map do |f|
    url = f.description[%r{https?://[^\s"'<>]+}]
    next unless url

    {
        "url" => url,
        "status" => f.status,
        "path" => f.path,
        "line" => f.line,
        "description" => f.description,
    }
end

# Links that HTMLProofer skipped for stage 2 to check.
deferred = Dir.glob("./_site/**/*.html").flat_map do |path|
    Nokogiri::HTML(File.read(path)).css("a[href]").filter_map do |a|
        url = a["href"].strip
        check = stage2_check(url)
        next unless check

        {
            "url" => url,
            "status" => nil,
            "path" => path,
            "line" => a.line,
            "description" => "Not checked in stage 1",
            "check" => check,
        }
    end
end

File.write(BROKEN_EXTERNAL_FILE, JSON.pretty_generate(data + deferred))

puts "Stage 1: #{internal.length} internal failure(s), #{external.length} external link failure(s)."

# Internal breakage is on our own site. Fail clearly so proof stops.
unless internal.empty?
    puts "\nInternal failures (fix before releasing):"
    internal.each do |f|
        loc = [f.path, f.line].compact.reject { |v| v.to_s.empty? }.join(":")
        puts "  * #{loc.empty? ? f.check_name : loc}"
        puts "      #{f.description}"
    end
    exit 1
end

deferred_urls = deferred.map { |u| u["url"] }.uniq.length
if data.empty? && deferred_urls.zero?
    puts "Stage 1: no external links flagged. ✓"
else
    puts "Stage 1: #{data.length} external link(s) flagged, plus #{deferred_urls} social link(s) → stage 2 will verify them."
end
