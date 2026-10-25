"""Verify that extracted Markdown carries the same words as the Word source.

Compares the word sequence of the .docx paragraphs with the word sequence of the
generated Markdown files (footnote definitions excluded, emphasis markers and
footnote markers normalised away).
"""

import difflib
import re
import sys
from pathlib import Path

import docx


def normalise(text):
    text = re.sub(r"^\[\^\d+\]:.*$", "", text, flags=re.M)   # footnote definitions
    text = re.sub(r"\[\^\d+\]", "", text)                    # footnote references
    text = re.sub(r"^#+\s*", "", text, flags=re.M)           # heading markers
    text = text.replace("**", "").replace("*", "")           # emphasis markers and stray marks
    return text.split()


def docx_words(path):
    document = docx.Document(str(path))
    return normalise("\n".join(p.text for p in document.paragraphs))


def md_words(paths):
    words = []
    for path in paths:
        words.extend(normalise(Path(path).read_text(encoding="utf-8")))
    return words


def main():
    docx_path = sys.argv[1]
    md_paths = sys.argv[2:]
    expected = docx_words(docx_path)
    actual = md_words(md_paths)
    matcher = difflib.SequenceMatcher(a=expected, b=actual, autojunk=False)
    diffs = [op for op in matcher.get_opcodes() if op[0] != "equal"]
    print(f"source words={len(expected)} markdown words={len(actual)} differences={len(diffs)}")
    for tag, i1, i2, j1, j2 in diffs[:10]:
        print(f"  {tag}: source={' '.join(expected[i1:i2])[:90]!r}"
              f"  md={' '.join(actual[j1:j2])[:90]!r}")
    return 0 if not diffs else 1


if __name__ == "__main__":
    sys.exit(main())
