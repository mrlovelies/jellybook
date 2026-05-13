using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SharpCompress.Archives;
using SharpCompress.Common;

namespace Jellybook.Server.Services;

public sealed record ComicPage(int Index, string EntryFullName, string FileName, string MimeType, long Size);

public static class ComicArchive
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"
    };

    public static bool IsComicArchive(string path) =>
        path.EndsWith(".cbz", StringComparison.OrdinalIgnoreCase) ||
        path.EndsWith(".cbr", StringComparison.OrdinalIgnoreCase);

    public static IReadOnlyList<ComicPage> EnumeratePages(string archivePath)
    {
        using var archive = ArchiveFactory.Open(archivePath);
        return archive.Entries
            .Where(e => !e.IsDirectory && !string.IsNullOrEmpty(e.Key) && ImageExtensions.Contains(Path.GetExtension(e.Key)))
            .OrderBy(e => e.Key!, NaturalComparer.Instance)
            .Select((e, i) => new ComicPage(
                i,
                e.Key ?? string.Empty,
                Path.GetFileName(e.Key) ?? string.Empty,
                MimeFromExtension(Path.GetExtension(e.Key)),
                e.Size))
            .ToList();
    }

    public static MemoryStream OpenPage(string archivePath, int pageIndex, out string mimeType, out string fileName)
    {
        using var archive = ArchiveFactory.Open(archivePath);
        var entries = archive.Entries
            .Where(e => !e.IsDirectory && !string.IsNullOrEmpty(e.Key) && ImageExtensions.Contains(Path.GetExtension(e.Key)))
            .OrderBy(e => e.Key!, NaturalComparer.Instance)
            .ToList();

        if (pageIndex < 0 || pageIndex >= entries.Count)
            throw new ArgumentOutOfRangeException(nameof(pageIndex));

        var entry = entries[pageIndex];
        mimeType = MimeFromExtension(Path.GetExtension(entry.Key));
        fileName = Path.GetFileName(entry.Key) ?? string.Empty;

        var ms = new MemoryStream(capacity: (int)Math.Min(entry.Size, int.MaxValue));
        using (var es = entry.OpenEntryStream())
        {
            es.CopyTo(ms);
        }
        ms.Position = 0;
        return ms;
    }

    private static string MimeFromExtension(string? ext) => (ext ?? string.Empty).ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        ".bmp" => "image/bmp",
        ".avif" => "image/avif",
        _ => "application/octet-stream"
    };
}
