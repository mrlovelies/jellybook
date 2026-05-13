using System;
using System.Linq;
using System.Reflection;
using Jellybook.Server.Services;
using MediaBrowser.Controller.Library;
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
    private readonly ILogger<JellybookController> _logger;

    public JellybookController(ILibraryManager libraryManager, ILogger<JellybookController> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
    }

    [HttpGet("web/main.js")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult GetMainScript()
    {
        var assembly = Assembly.GetExecutingAssembly();
        const string resourceName = "Jellybook.Server.Web.main.js";
        var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null) return NotFound();
        return File(stream, "application/javascript");
    }

    [HttpGet("Hello")]
    [AllowAnonymous]
    public IActionResult Hello() => Ok(new { name = "Jellybook", status = "alive" });

    [HttpGet("Book/{itemId:guid}/Manifest")]
    [Authorize]
    public IActionResult GetManifest(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null || string.IsNullOrEmpty(item.Path) || !System.IO.File.Exists(item.Path))
            return NotFound(new { error = "item not found" });

        if (!ComicArchive.IsComicArchive(item.Path))
            return BadRequest(new { error = "unsupported format", path = item.Path });

        try
        {
            var pages = ComicArchive.EnumeratePages(item.Path);
            return Ok(new
            {
                id = itemId,
                name = item.Name,
                type = "comic",
                format = "cbz",
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
            _logger.LogError(ex, "Jellybook: failed to read manifest for item {ItemId}", itemId);
            return StatusCode(500, new { error = "failed to read archive" });
        }
    }

    [HttpGet("Book/{itemId:guid}/Page/{pageIndex:int}")]
    [Authorize]
    public IActionResult GetPage(Guid itemId, int pageIndex)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null || string.IsNullOrEmpty(item.Path) || !System.IO.File.Exists(item.Path))
            return NotFound();

        if (!ComicArchive.IsComicArchive(item.Path))
            return BadRequest(new { error = "unsupported format" });

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
            _logger.LogError(ex, "Jellybook: failed to stream page {Page} of item {ItemId}", pageIndex, itemId);
            return StatusCode(500);
        }
    }
}
