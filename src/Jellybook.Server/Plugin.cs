using System;
using Jellybook.Server.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellybook.Server;

public class Plugin : BasePlugin<PluginConfiguration>
{
    public override string Name => "Jellybook";
    public override Guid Id => Guid.Parse("bf366625-1c5f-44b1-b1f2-6a54406a814b");
    public override string Description => "Comic book and ebook reader for Jellyfin";

    public static Plugin? Instance { get; private set; }

    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }
}
