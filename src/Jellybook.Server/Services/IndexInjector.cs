using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellybook.Server.Services;

public class IndexInjector : IHostedService
{
    private const string ScriptTag = "<script defer src=\"/Jellybook/web/main.js\"></script>";
    private const string MarkerStart = "<!-- jellybook:start -->";
    private const string MarkerEnd = "<!-- jellybook:end -->";

    private readonly IServerConfigurationManager _config;
    private readonly ILogger<IndexInjector> _logger;

    public IndexInjector(IServerConfigurationManager config, ILogger<IndexInjector> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            var webPath = _config.ApplicationPaths.WebPath;
            var indexPath = Path.Combine(webPath, "index.html");
            if (!File.Exists(indexPath))
            {
                _logger.LogWarning("Jellybook: index.html not found at {Path}, skipping injection", indexPath);
                return Task.CompletedTask;
            }

            var html = File.ReadAllText(indexPath);

            var startIdx = html.IndexOf(MarkerStart, StringComparison.Ordinal);
            var endIdx = html.IndexOf(MarkerEnd, StringComparison.Ordinal);
            if (startIdx >= 0 && endIdx > startIdx)
            {
                html = html.Remove(startIdx, endIdx - startIdx + MarkerEnd.Length);
            }

            var injection = $"{MarkerStart}{ScriptTag}{MarkerEnd}";
            var bodyClose = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (bodyClose < 0)
            {
                _logger.LogWarning("Jellybook: </body> not found in index.html, skipping injection");
                return Task.CompletedTask;
            }
            html = html.Insert(bodyClose, injection);

            File.WriteAllText(indexPath, html);
            _logger.LogInformation("Jellybook: injected script tag into index.html at {Path}", indexPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Jellybook: failed to patch index.html");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
