# IIIF

- **Full Name:** International Image Interoperability Framework
- **URL:** https://iiif.io/api/
- **License:** CC-BY (specifications)

## What It Does
Suite of APIs for delivering and annotating high-resolution images. Core concepts: Manifest (describes a digital object), Canvas (virtual coordinate space), Annotation (content painted onto canvas).

## Key for Our Project
The Canvas concept: an abstract coordinate space where content is composed via annotations. A scientific figure modeled as IIIF Canvas = chart images, LaTeX labels, arrows are all annotations targeting regions.

The IIIF Shared Canvas model's separation of canvas (abstract space) from annotations (what is placed on it) is a mature, standards-based pattern for exactly what we need.

## Key Insight
Our figure canvas IS an IIIF Canvas. Each element (chart, label, arrow, equation) is an annotation targeting a region. This gives interoperability with the digital humanities/library ecosystem.
