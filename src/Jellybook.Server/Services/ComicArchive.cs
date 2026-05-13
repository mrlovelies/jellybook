using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;

namespace Jellybook.Server.Services;

public sealed record ComicPage(int Index, string EntryFullName, string FileName, string MimeType, long Size);

public static class ComicArchive
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"
    };

    public static bool IsComicArchive(string path) =>
        path.EndsWith(".cbz", StringComparison.OrdinalIgnoreCase);

    public static IReadOnlyList<ComicPage> EnumeratePages(string archivePath)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        return archive.Entries
            .Where(e => !string.IsNullOrEmpty(e.Name) && ImageExtensions.Contains(Path.GetExtension(e.Name)))
            .OrderBy(e => e.FullName, NaturalComparer.Instance)
            .Select((e, i) => new ComicPage(i, e.FullName, e.Name, MimeFromExtension(Path.GetExtension(e.Name)), e.Length))
            .ToList();
    }

    public static MemoryStream OpenPage(string archivePath, int pageIndex, out string mimeType, out string fileName)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        var entries = archive.Entries
            .Where(e => !string.IsNullOrEmpty(e.Name) && ImageExtensions.Contains(Path.GetExtension(e.Name)))
            .OrderBy(e => e.FullName, NaturalComparer.Instance)
            .ToList();

        if (pageIndex < 0 || pageIndex >= entries.Count)
            throw new ArgumentOutOfRangeException(nameof(pageIndex));

        var entry = entries[pageIndex];
        mimeType = MimeFromExtension(Path.GetExtension(entry.Name));
        fileName = entry.Name;

        var ms = new MemoryStream(capacity: (int)Math.Min(entry.Length, int.MaxValue));
        using (var es = entry.Open())
        {
            es.CopyTo(ms);
        }
        ms.Position = 0;
        return ms;
    }

    private static string MimeFromExtension(string ext) => ext.ToLowerInvariant() switch
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
