"""Prompt builders for the story writer (Ollama) and illustrator (Forge)."""

import re

NEGATIVE_PROMPT = (
    "blurry, low quality, worst quality, jpeg artifacts, watermark, text, words, "
    "letters, signature, deformed, distorted, bad anatomy, bad hands, "
    "missing fingers, extra fingers, extra limbs, cropped, out of frame, "
    "morbid, mutilated, scary, horror"
)

STYLE_SUFFIXES = {
    "watercolor": "children's picture-book illustration, warm watercolor, soft light",
    "pixar3d": "3d animated film still, pixar style, soft studio lighting, cute",
    "anime": "anime illustration, studio ghibli inspired, vibrant, detailed background",
    "crayon": "child's crayon drawing, simple shapes, bright colors, playful",
    "comic": "colorful comic book panel, bold outlines, dynamic",
}


def style_suffix(art_style: str) -> str:
    return STYLE_SUFFIXES.get(art_style, STYLE_SUFFIXES["watercolor"])


def build_chapter_messages(
    *,
    theme: str,
    hero: str,
    chapter_idx: int,  # 0-based
    total_chapters: int,
    previous_recap: str,
    art_style: str,
    guide: str = "",
) -> list[dict]:
    """Chat messages that force the LLM to return strict JSON per chapter."""
    position = (
        "the opening chapter: introduce the hero and the world"
        if chapter_idx == 0
        else "the final chapter: resolve the adventure with a warm ending"
        if chapter_idx == total_chapters - 1
        else f"a middle chapter: raise the stakes with a new obstacle or discovery"
    )
    system = (
        "You write chapters of a children's picture book. "
        "You ALWAYS reply with a single JSON object and nothing else — "
        "no markdown fences, no commentary. Schema: "
        '{"text": "<120-180 words of story prose>", '
        '"image_prompt": "<one sentence describing the key visual scene, '
        "concrete nouns, no names the artist can't draw>\"}. "
        f"This is chapter {chapter_idx + 1} of {total_chapters}: {position}. "
        f"The hero is {hero}. The theme is: {theme}. "
        "Keep continuity with the story so far. "
        + (f"Format guide: {guide} " if guide else "") +
        "The image_prompt must be drawable: describe who is where doing what, "
        "plus mood and setting."
    )
    user = f"Story so far: {previous_recap or 'Nothing yet — this is the beginning.'}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_image_prompt(*, image_prompt: str, hero_desc: str, art_style: str, lora: str = "") -> str:
    """Lock character + style onto every scene prompt.

    Triple lock: hero named as the main subject (presence), descriptor
    repeated (consistency), style suffix (look). Optional SD1.5 LoRA
    trigger appended (<lora:name:0.8>); names are sanitized.
    """
    hero = hero_desc.strip() or "the hero"
    prompt = (
        f"{image_prompt}, starring {hero} as the main subject, "
        f"{hero} clearly visible in the foreground, "
        f"{style_suffix(art_style)}, consistent character design: {hero}"
    )
    name = (lora or "").strip()
    if name and re.fullmatch(r"[A-Za-z0-9 _.\-]+", name):
        prompt += f", <lora:{name}:0.8>"
    return prompt


def build_reference_prompt(*, hero_desc: str, art_style: str) -> str:
    """Prompt for the one-off hero reference portrait (IP-Adapter source)."""
    hero = hero_desc.strip() or "the hero"
    return (
        f"character reference portrait of {hero}, full body, centered, "
        f"neutral plain background, {style_suffix(art_style)}"
    )
