using System;
using System.Collections.Generic;

namespace Jellybook.Server.Services;

public sealed class NaturalComparer : IComparer<string>
{
    public static readonly NaturalComparer Instance = new();

    public int Compare(string? x, string? y)
    {
        if (ReferenceEquals(x, y)) return 0;
        if (x is null) return -1;
        if (y is null) return 1;

        int ix = 0, iy = 0;
        while (ix < x.Length && iy < y.Length)
        {
            if (char.IsDigit(x[ix]) && char.IsDigit(y[iy]))
            {
                long nx = 0, ny = 0;
                while (ix < x.Length && char.IsDigit(x[ix])) { nx = nx * 10 + (x[ix] - '0'); ix++; }
                while (iy < y.Length && char.IsDigit(y[iy])) { ny = ny * 10 + (y[iy] - '0'); iy++; }
                if (nx != ny) return nx < ny ? -1 : 1;
            }
            else
            {
                var cx = char.ToLowerInvariant(x[ix]);
                var cy = char.ToLowerInvariant(y[iy]);
                if (cx != cy) return cx < cy ? -1 : 1;
                ix++; iy++;
            }
        }
        return x.Length - y.Length;
    }
}
