using Jellybook.Server.Services;
using Xunit;

namespace Jellybook.Tests;

public class NaturalComparerTests
{
    private static int Sign(int n) => n < 0 ? -1 : n > 0 ? 1 : 0;
    private readonly NaturalComparer _cmp = NaturalComparer.Instance;

    [Theory]
    [InlineData("page2.jpg", "page10.jpg", -1)]   // numeric, not lexicographic (2 < 10)
    [InlineData("page10.jpg", "page2.jpg", 1)]
    [InlineData("10", "10a", -1)]                  // a number then a suffix
    [InlineData("page1", "page1", 0)]
    [InlineData("a", "b", -1)]
    [InlineData("Page1", "page1", 0)]              // case-insensitive
    [InlineData("ch1-p2", "ch1-p10", -1)]          // a numeric run in the middle
    [InlineData("page01", "page1", 1)]             // equal numeric value; the longer string sorts after
    public void Compare_orders_naturally(string x, string y, int expected)
        => Assert.Equal(expected, Sign(_cmp.Compare(x, y)));

    [Fact]
    public void Sort_puts_10_after_2_not_after_1()
    {
        // The whole point: a lexicographic sort would put "10" right after "1".
        var pages = new List<string> { "10.jpg", "1.jpg", "2.jpg", "21.jpg", "3.jpg" };
        pages.Sort(_cmp);
        Assert.Equal(new[] { "1.jpg", "2.jpg", "3.jpg", "10.jpg", "21.jpg" }, pages);
    }

    [Fact]
    public void Nulls_are_ordered_consistently()
    {
        Assert.Equal(-1, Sign(_cmp.Compare(null, "a")));
        Assert.Equal(1, Sign(_cmp.Compare("a", null)));
        Assert.Equal(0, _cmp.Compare(null, null));
    }
}
