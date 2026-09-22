"""Styled picture-book PDF export."""
from __future__ import annotations

import html
import os
import re

from fastapi import HTTPException

try:
    from .store import book_dir, public_book
except ImportError:
    from store import book_dir, public_book

CHAPTER_WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]


def _pdf_fonts() -> dict[str, str]:
    """Register a serif family; fall back to PDF built-ins."""
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        candidates = {
            "Serif": "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
            "Serif-Bold": "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            "Serif-Italic": "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
        }
        for name, path in candidates.items():
            if os.path.exists(path) and name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(name, path))
        if all(n in pdfmetrics.getRegisteredFontNames() for n in candidates):
            return {"serif": "Serif", "bold": "Serif-Bold", "italic": "Serif-Italic"}
    except Exception:
        pass
    return {"serif": "Times-Roman", "bold": "Times-Bold", "italic": "Times-Italic"}


def render_pdf(book_id: str) -> bytes:
    """Build a styled square picture-book PDF."""
    try:
        from io import BytesIO

        from reportlab.lib.colors import HexColor
        from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            HRFlowable,
            Image as RLImage,
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
        )
    except ImportError:
        raise HTTPException(500, "PDF engine not installed (pip install reportlab pillow)")

    from datetime import date

    book = public_book(book_id)
    meta = book["meta"]
    fonts = _pdf_fonts()
    BG, INK, ACCENT, MUTED = (HexColor(c) for c in ("#FAF7F0", "#292524", "#B45309", "#78716C"))
    PAGE = (8 * inch, 8 * inch)
    MARGIN = 0.75 * inch

    def _bg(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(BG)
        canvas.rect(0, 0, PAGE[0], PAGE[1], fill=1, stroke=0)
        canvas.restoreState()

    def _page(canvas, doc):
        _bg(canvas, doc)
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawCentredString(PAGE[0] / 2, 0.45 * inch, f"{meta['hero']}  •  {doc.page}")
        canvas.restoreState()

    title_style = ParagraphStyle("title", fontName=fonts["bold"], fontSize=34, leading=40,
                                 textColor=INK, alignment=TA_CENTER, spaceAfter=12)
    theme_style = ParagraphStyle("theme", fontName=fonts["italic"], fontSize=14, leading=20,
                                 textColor=MUTED, alignment=TA_CENTER, spaceAfter=18)
    meta_style = ParagraphStyle("meta", fontName="Helvetica", fontSize=10, leading=14,
                                textColor=MUTED, alignment=TA_CENTER)
    head_style = ParagraphStyle("head", fontName=fonts["bold"], fontSize=15, leading=20,
                                textColor=ACCENT, alignment=TA_CENTER, spaceAfter=10, spaceBefore=6)
    body_style = ParagraphStyle("body", fontName=fonts["serif"], fontSize=12, leading=17,
                                textColor=INK, alignment=TA_JUSTIFY, spaceAfter=8)
    end_style = ParagraphStyle("end", fontName=fonts["bold"], fontSize=22, leading=28,
                               textColor=INK, alignment=TA_CENTER)

    story: list = []
    story.append(Spacer(1, 2.0 * inch))
    story.append(Paragraph(html.escape(meta["hero"]), title_style))
    story.append(Paragraph(html.escape(meta["theme"]), theme_style))
    story.append(HRFlowable(width="30%", thickness=1, color=ACCENT, spaceAfter=18,
                            spaceBefore=6, hAlign="CENTER", vAlign="BOTTOM"))
    story.append(Paragraph(
        f"An illustrated story  •  {html.escape(meta['art_style'])}  •  {date.today().isoformat()}",
        meta_style))
    story.append(PageBreak())

    img_dir = book_dir(book_id)
    max_w, max_h = PAGE[0] - 2 * MARGIN, 2.8 * inch
    for c in book["chapters"]:
        word = CHAPTER_WORDS[c["idx"]] if c["idx"] < len(CHAPTER_WORDS) else str(c["idx"] + 1)
        story.append(Paragraph(f"Chapter {word}", head_style))
        img_path = img_dir / f"ch{c['idx']}.png"
        if img_path.exists():
            try:
                from PIL import Image as PILImage

                w, h = PILImage.open(img_path).size
                scale = min(max_w / w, max_h / h)
                img = RLImage(str(img_path), width=w * scale, height=h * scale)
                img.hAlign = "CENTER"
                story.append(img)
                story.append(Spacer(1, 0.15 * inch))
            except Exception:
                story.append(Paragraph("<i>(image could not be placed)</i>", meta_style))
        else:
            story.append(Paragraph("<i>(image pending)</i>", meta_style))
        text = (c.get("text") or "").strip()
        if text:
            paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
            first = True
            for p in paras:
                esc = html.escape(p)
                if first:
                    esc = (f'<font size="30" color="#B45309">{esc[0]}</font>{esc[1:]}'
                           if esc else esc)
                    first = False
                story.append(Paragraph(esc, body_style))
        else:
            story.append(Paragraph("<i>(text pending)</i>", body_style))
        story.append(PageBreak())

    story.append(Spacer(1, 3.0 * inch))
    story.append(Paragraph("The End", end_style))

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=PAGE, leftMargin=MARGIN, rightMargin=MARGIN,
                            topMargin=MARGIN, bottomMargin=0.7 * inch,
                            title=f"{meta['hero']} — {meta['theme']}", author="Storybook Studio")
    doc.build(story, onFirstPage=_bg, onLaterPages=_page)
    return buf.getvalue()
