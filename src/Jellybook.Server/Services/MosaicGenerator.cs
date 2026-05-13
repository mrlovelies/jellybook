using System;
using System.Collections.Generic;
using SkiaSharp;

namespace Jellybook.Server.Services;

public static class MosaicGenerator
{
    // Book-cover aspect ratio (2:3). 600x900 = 4x quadrants of 300x450 each.
    private const int Width = 600;
    private const int Height = 900;

    public static byte[]? Build(IReadOnlyList<byte[]> sources)
    {
        if (sources.Count == 0) return null;

        using var surface = SKSurface.Create(new SKImageInfo(Width, Height, SKColorType.Rgba8888, SKAlphaType.Opaque));
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Black);

        if (sources.Count == 1)
        {
            // Single source — fill the whole mosaic with one cover (cropped to fit aspect)
            DrawCenterCropped(canvas, sources[0], new SKRect(0, 0, Width, Height));
        }
        else
        {
            // 2x2 grid, cycle through available sources to fill empty quadrants
            int qw = Width / 2;
            int qh = Height / 2;
            for (int i = 0; i < 4; i++)
            {
                int x = (i % 2) * qw;
                int y = (i / 2) * qh;
                DrawCenterCropped(canvas, sources[i % sources.Count], new SKRect(x, y, x + qw, y + qh));
            }
        }

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 88);
        return data.ToArray();
    }

    private static void DrawCenterCropped(SKCanvas canvas, byte[] imageBytes, SKRect dest)
    {
        using var bitmap = SKBitmap.Decode(imageBytes);
        if (bitmap is null) return;

        float srcAspect = (float)bitmap.Width / bitmap.Height;
        float destAspect = dest.Width / dest.Height;
        SKRect src;
        if (srcAspect > destAspect)
        {
            // Source is wider — crop sides
            float w = bitmap.Height * destAspect;
            float xOff = (bitmap.Width - w) / 2;
            src = new SKRect(xOff, 0, xOff + w, bitmap.Height);
        }
        else
        {
            // Source is taller — crop top/bottom
            float h = bitmap.Width / destAspect;
            float yOff = (bitmap.Height - h) / 2;
            src = new SKRect(0, yOff, bitmap.Width, yOff + h);
        }
        canvas.DrawBitmap(bitmap, src, dest);
    }
}
