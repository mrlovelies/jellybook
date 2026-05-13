using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellybook.Server.Services;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellybook.Server.ScheduledTasks;

public class FolderMosaicTask : IScheduledTask
{
    public string Name => "Generate Jellybook folder cover mosaics";
    public string Key => "JellybookFolderMosaicTask";
    public string Description => "Composites 2x2 mosaics of child book covers and assigns them as folder Primary images. Runs across all libraries of type 'books'.";
    public string Category => "Jellybook";

    private readonly ILibraryManager _libraryManager;
    private readonly IProviderManager _providerManager;
    private readonly ILogger<FolderMosaicTask> _logger;

    public FolderMosaicTask(
        ILibraryManager libraryManager,
        IProviderManager providerManager,
        ILogger<FolderMosaicTask> logger)
    {
        _libraryManager = libraryManager;
        _providerManager = providerManager;
        _logger = logger;
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => new[]
    {
        new TaskTriggerInfo
        {
            Type = TaskTriggerInfoType.DailyTrigger,
            TimeOfDayTicks = TimeSpan.FromHours(4).Ticks
        }
    };

    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        var bookLibIds = _libraryManager.GetVirtualFolders()
            .Where(vf => vf.CollectionType == CollectionTypeOptions.books)
            .Select(vf => Guid.TryParse(vf.ItemId, out var g) ? g : Guid.Empty)
            .Where(g => g != Guid.Empty)
            .ToList();

        _logger.LogInformation("FolderMosaic: scanning {Count} book libraries", bookLibIds.Count);

        var folders = new List<BaseItem>();
        foreach (var libId in bookLibIds)
        {
            var items = _libraryManager.GetItemList(new InternalItemsQuery
            {
                ParentId = libId,
                IncludeItemTypes = new[] { BaseItemKind.Folder },
                Recursive = true
            });
            folders.AddRange(items);
        }

        _logger.LogInformation("FolderMosaic: {Count} folders to consider", folders.Count);

        int processed = 0;
        int generated = 0;
        foreach (var folder in folders)
        {
            cancellationToken.ThrowIfCancellationRequested();
            processed++;
            progress.Report(processed * 100.0 / Math.Max(1, folders.Count));

            try
            {
                var sources = CollectChildCoverBytes(folder, max: 4, cancellationToken);
                if (sources.Count == 0) continue;

                var mosaic = MosaicGenerator.Build(sources);
                if (mosaic is null) continue;

                using var ms = new MemoryStream(mosaic);
                await _providerManager.SaveImage(folder, ms, "image/jpeg", ImageType.Primary, null, cancellationToken)
                    .ConfigureAwait(false);

                generated++;
                _logger.LogInformation("FolderMosaic: {Folder} ({Sources} sources)", folder.Name, sources.Count);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "FolderMosaic: failed for {Folder}", folder.Name);
            }
        }

        _logger.LogInformation("FolderMosaic: generated {Generated} of {Processed} folders", generated, processed);
    }

    private List<byte[]> CollectChildCoverBytes(BaseItem folder, int max, CancellationToken ct)
    {
        var descendants = _libraryManager.GetItemList(new InternalItemsQuery
        {
            ParentId = folder.Id,
            Recursive = true,
            Limit = max * 4 // pull extra in case some lack images
            // (OrderBy intentionally omitted — default order is stable enough for cover selection)
        });

        var bytes = new List<byte[]>(max);
        foreach (var d in descendants)
        {
            if (ct.IsCancellationRequested) break;
            if (bytes.Count >= max) break;
            if (!d.HasImage(ImageType.Primary)) continue;
            var path = d.GetImagePath(ImageType.Primary, 0);
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) continue;
            try { bytes.Add(File.ReadAllBytes(path)); }
            catch (Exception ex) { _logger.LogDebug(ex, "FolderMosaic: skip {Path}", path); }
        }
        return bytes;
    }
}
