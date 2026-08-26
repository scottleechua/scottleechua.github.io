require "html-proofer"
require "json"
require "fileutils"
require "stringio"

# Stage 1 of the link checker
#
# HTMLProofer is fast. But it produces false-positive failures for external hosts
# that block bots (LinkedIn 999, Medium/Cloudflare 403, X 400, rate-limits...).

BROKEN_EXTERNAL_FILE = "tmp/broken-external-links.json"

options = {
    ignore_urls: [
        # Not a bot-blocker workaround: this host serves no HTTPS at all (the TLS
        # handshake is reset), so the http:// link in _data/coauthors.yml is correct
        # and HTMLProofer's enforce-https check is a permanent false positive here.
        %r{[\S]*guillemriambau\.com[\S]*},
    ],
    cache: {
        timeframe: {
            external: "2w"
        }
    }
}

runner = HTMLProofer.check_directory("./_site", options)

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
File.write(BROKEN_EXTERNAL_FILE, JSON.pretty_generate(data))

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

if data.empty?
    puts "Stage 1: no external links flagged. ✓"
else
    puts "Stage 1: #{data.length} external link(s) flagged → stage 2 will verify in a real browser."
end
