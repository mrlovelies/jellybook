using System;

namespace Jellybook.Server.Services;

public enum BookFormat { Unknown, Cbz, Cbr, Epub }

public static class BookFormats
{
    public static BookFormat Detect(string path)
    {
        if (path.EndsWith(".cbz", StringComparison.OrdinalIgnoreCase)) return BookFormat.Cbz;
        if (path.EndsWith(".cbr", StringComparison.OrdinalIgnoreCase)) return BookFormat.Cbr;
        if (path.EndsWith(".epub", StringComparison.OrdinalIgnoreCase)) return BookFormat.Epub;
        return BookFormat.Unknown;
    }

    public static bool IsComic(BookFormat f) => f is BookFormat.Cbz or BookFormat.Cbr;
    public static bool IsEbook(BookFormat f) => f is BookFormat.Epub;

    public static string ToWire(BookFormat f) => f switch
    {
        BookFormat.Cbz => "cbz",
        BookFormat.Cbr => "cbr",
        BookFormat.Epub => "epub",
        _ => "unknown"
    };
}
