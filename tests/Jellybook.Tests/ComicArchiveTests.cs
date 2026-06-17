using System.IO.Compression;
using System.Text;
using Jellybook.Server.Services;
using Xunit;

namespace Jellybook.Tests;

// Builds a real .cbz (a zip) on disk with image pages deliberately out of order,
// plus non-image files that must be filtered out, then exercises the real
// SharpCompress read path in ComicArchive.
public sealed class ComicArchiveTests : IDisposable
{
    private readonly string _dir;
    private readonly string _cbz;

    public ComicArchiveTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "jellybook-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _cbz = Path.Combine(_dir, "issue.cbz");

        var entries = new (string Name, byte[] Bytes)[]
        {
            ("10.jpg", new byte[] { 1, 2, 3 }),                     // out of order on purpose
            ("2.jpg", new byte[] { 1, 2, 3, 4 }),
            ("1.png", new byte[] { 9 }),
            ("ComicInfo.xml", Encoding.UTF8.GetBytes("<ComicInfo/>")), // not an image -> filtered
            ("notes.txt", new byte[] { 0 }),                           // not an image -> filtered
        };

        using var fs = File.Create(_cbz);
        using var zip = new ZipArchive(fs, ZipArchiveMode.Create);
        foreach (var (name, bytes) in entries)
        {
            var entry = zip.CreateEntry(name);
            using var s = entry.Open();
            s.Write(bytes, 0, bytes.Length);
        }
    }

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void EnumeratePages_keeps_only_image_entries()
    {
        var names = ComicArchive.EnumeratePages(_cbz).Select(p => p.FileName).ToList();
        Assert.Equal(3, names.Count);
        Assert.DoesNotContain("ComicInfo.xml", names);
        Assert.DoesNotContain("notes.txt", names);
    }

    [Fact]
    public void EnumeratePages_orders_naturally_and_indexes_sequentially()
    {
        var pages = ComicArchive.EnumeratePages(_cbz);
        Assert.Equal(new[] { "1.png", "2.jpg", "10.jpg" }, pages.Select(p => p.FileName));
        Assert.Equal(new[] { 0, 1, 2 }, pages.Select(p => p.Index));
    }

    [Fact]
    public void EnumeratePages_sets_mime_from_extension()
    {
        var byName = ComicArchive.EnumeratePages(_cbz).ToDictionary(p => p.FileName, p => p.MimeType);
        Assert.Equal("image/png", byName["1.png"]);
        Assert.Equal("image/jpeg", byName["2.jpg"]);
        Assert.Equal("image/jpeg", byName["10.jpg"]);
    }

    [Fact]
    public void OpenPage_returns_the_right_page_in_natural_order()
    {
        // Page 0 is "1.png" (the {9} byte), not "10.jpg" which was first in the zip.
        using var page0 = ComicArchive.OpenPage(_cbz, 0, out var mime, out var name);
        Assert.Equal("1.png", name);
        Assert.Equal("image/png", mime);
        Assert.Equal(new byte[] { 9 }, page0.ToArray());
    }

    [Fact]
    public void OpenPage_throws_when_the_index_is_out_of_range()
        => Assert.Throws<ArgumentOutOfRangeException>(() => ComicArchive.OpenPage(_cbz, 99, out _, out _));

    [Theory]
    [InlineData("Issue 1.cbz", true)]
    [InlineData("issue.CBR", true)]    // case-insensitive
    [InlineData("book.pdf", false)]
    [InlineData("archive.zip", false)]
    public void IsComicArchive_checks_the_extension(string path, bool expected)
        => Assert.Equal(expected, ComicArchive.IsComicArchive(path));
}
