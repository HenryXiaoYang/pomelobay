# dev/fonts-src

Original, unsubsetted Caladea faces. Not packaged (theme-package only ships
templates/, theme.yaml, settings.yaml, LICENSE and README.md).

The files in templates/assets/fonts/ are subsets of these, about 20% smaller,
covering Basic Latin + Latin-1, Latin Extended-A (accented names), the pinyin
tone vowels, general punctuation (dashes, curly quotes, ellipsis), the euro and
trademark signs, and the arrows U+2190-2193. Chinese never used these faces -
it falls through to the system CJK fonts in the font stack.

To re-subset after adding a glyph range (needs `pip install fonttools brotli`):

    for f in Caladea-Regular Caladea-Bold Caladea-Italic Caladea-BoldItalic; do
      pyftsubset dev/fonts-src/$f.woff2 --flavor=woff2 \
        --output-file=templates/assets/fonts/$f.woff2 --layout-features='*' \
        --unicodes="U+0000-00FF,U+0100-017F,U+01CD-01DC,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+FEFF,U+FFFD"
    done

Keep the `unicode-range` on the @font-face rules in src/css/main.css in step.
