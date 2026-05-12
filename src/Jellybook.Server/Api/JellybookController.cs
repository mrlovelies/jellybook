using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellybook.Server.Api;

[ApiController]
[Route("Jellybook")]
public class JellybookController : ControllerBase
{
    [HttpGet("web/main.js")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetMainScript()
    {
        var assembly = Assembly.GetExecutingAssembly();
        const string resourceName = "Jellybook.Server.Web.main.js";
        var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound();
        }
        return File(stream, "application/javascript");
    }

    [HttpGet("Hello")]
    [AllowAnonymous]
    public IActionResult Hello() => Ok(new { name = "Jellybook", status = "alive" });
}
