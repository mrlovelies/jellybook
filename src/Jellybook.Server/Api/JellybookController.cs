using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Jellybook.Server.Services;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellybook.Server.Api;

[ApiController]
[Route("Jellybook")]
public class JellybookController : ControllerBase
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserDataManager _userDataManager;
    private readonly IUserManager _userManager;
    private readonly ILogger<JellybookController> _logger;

    public JellybookController(
        ILibraryManager libraryManager,
        IUserDataManager userDataManager,
        IUserManager userManager,
        ILogger<JellybookController> logger)
    {
        _libraryManager = libraryManager;
        _userDataManager = userDataManager;
        _userManager = userManager;
        _logger = logger;
    }

    // ----- web assets -----

    [HttpGet("web/main.js")]
    [AllowAnonymous]
    public IActionResult GetMainScript() => ServeEmbedded("Jellybook.Server.Web.main.js", "application/javascript");

    private IActionResult ServeEmbedded(string resourceName, string mimeType)
    {
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
        if (stream is null) return NotFound();
        Response.Headers.CacheControl = "public, max-age=86400";
        return File(stream, mimeType);
    }

    [HttpGet("Hello")]
    [AllowAnonymous]
    public IActionResult Hello() => Ok(new { name = "Jellybook", status = "alive" });

    // ----- book api -----

    [HttpGet("Book/{itemId:guid}/Manifest")]
    [Authorize]
    public IActionResult GetManifest(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null || string.IsNullOrEmpty(item.Path) || !System.IO.File.Exists(item.Path))
            return NotFound(new { error = "item not found" });

        var format = BookFormats.Detect(item.Path);
        if (format == BookFormat.Unknown)
            return BadRequest(new { error = "unsupported format", path = item.Path });

        if (BookFormats.IsComic(format))
        {
            try
            {
                var pages = ComicArchive.EnumeratePages(item.Path);
                return Ok(new
                {
                    id = itemId,
                    name = item.Name,
                    type = "comic",
                    format = BookFormats.ToWire(format),
                    pageCount = pages.Count,
                    pages = pages.Select(p => new
                    {
                        index = p.Index,
                        fileName = p.FileName,
                        mimeType = p.MimeType,
                        size = p.Size
                    })
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Jellybook: failed to read comic manifest for {ItemId}", itemId);
                return StatusCode(500, new { error = "failed to read archive", message = ex.Message });
            }
        }

        // ebook (EPUB) — client fetches the file directly and renders via epub.js
        var fileInfo = new FileInfo(item.Path);
        return Ok(new
        {
            id = itemId,
            name = item.Name,
            type = "ebook",
            format = BookFormats.ToWire(format),
            size = fileInfo.Length
        });
    }

    [HttpGet("Book/{itemId:guid}/Page/{pageIndex:int}")]
    [Authorize]
    public IActionResult GetPage(Guid itemId, int pageIndex)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null || string.IsNullOrEmpty(item.Path) || !System.IO.File.Exists(item.Path))
            return NotFound();

        if (!BookFormats.IsComic(BookFormats.Detect(item.Path)))
            return BadRequest(new { error = "page streaming only supported for comics" });

        try
        {
            var ms = ComicArchive.OpenPage(item.Path, pageIndex, out var mimeType, out _);
            Response.Headers.CacheControl = "private, max-age=3600";
            return File(ms, mimeType);
        }
        catch (ArgumentOutOfRangeException)
        {
            return NotFound(new { error = "page index out of range" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Jellybook: failed to stream page {Page} of {ItemId}", pageIndex, itemId);
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // Guided-view panel map: a sidecar "<comic>.cbz.panels.json" generated offline by
    // tools/panel-detect. Served verbatim; 404 when absent so the reader uses full pages.
    [HttpGet("Book/{itemId:guid}/Panels")]
    [Authorize]
    public IActionResult GetPanels(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null || string.IsNullOrEmpty(item.Path))
            return NotFound();

        var sidecar = item.Path + ".panels.json";
        if (!System.IO.File.Exists(sidecar))
            return NotFound(new { error = "no panel map" });

        Response.Headers.CacheControl = "private, max-age=86400";
        return PhysicalFile(sidecar, "application/json");
    }

    [HttpGet("Book/{itemId:guid}/Epub")]
    [Authorize]
    public IActionResult GetEpub(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null || string.IsNullOrEmpty(item.Path) || !System.IO.File.Exists(item.Path))
            return NotFound();

        if (BookFormats.Detect(item.Path) != BookFormat.Epub)
            return BadRequest(new { error = "not an EPUB" });

        var fs = System.IO.File.OpenRead(item.Path);
        return File(fs, "application/epub+zip", enableRangeProcessing: true);
    }

    [HttpGet("Book/{itemId:guid}/Progress")]
    [Authorize]
    public IActionResult GetProgress(Guid itemId, [FromQuery] Guid userId)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null) return NotFound();
        var user = _userManager.GetUserById(userId);
        if (user is null) return BadRequest(new { error = "user not found" });

        var data = _userDataManager.GetUserData(user, item);
        var pageIndex = (int)(data?.PlaybackPositionTicks ?? 0);
        return Ok(new
        {
            pageIndex,
            played = data?.Played ?? false,
            lastPlayedDate = data?.LastPlayedDate
        });
    }

    [HttpPost("Book/{itemId:guid}/Progress")]
    [Authorize]
    public IActionResult PostProgress(
        Guid itemId,
        [FromQuery] Guid userId,
        [FromQuery] int pageIndex,
        [FromQuery] int pageCount)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null) return NotFound();
        var user = _userManager.GetUserById(userId);
        if (user is null) return BadRequest(new { error = "user not found" });
        if (pageCount <= 0) return BadRequest(new { error = "pageCount must be positive" });

        pageIndex = Math.Max(0, Math.Min(pageIndex, pageCount - 1));

        var data = _userDataManager.GetUserData(user, item);
        data.PlaybackPositionTicks = pageIndex;
        data.LastPlayedDate = DateTime.UtcNow;
        data.Played = pageIndex + 1 >= pageCount;

        _userDataManager.SaveUserData(user, item, data, UserDataSaveReason.UpdateUserRating, System.Threading.CancellationToken.None);

        return Ok(new { pageIndex, played = data.Played });
    }
}
