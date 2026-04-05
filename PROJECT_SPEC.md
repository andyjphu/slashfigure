Potential product name: \figure, usefigure, slashfigure


Overview: The project situation is not set in stone right now, and we aren't immediately clear with how we are going to position this work. But the basic overview is that we are going to make a project that allows researchers to draw figures etc. with the same tools afforded to them right now by ms powerpoint, keynote, figma, lucidcharts but we will do so in a performant llm first way. Those tools may act differently but we will allow them in such a way that LLM understanding of the work is increased, and it becomes much more token efficient for a model to understand the image. I.e. why do we need a VL call everytime we have to present a figure to an LLM? in the image metadata should directly include a description which actually annotates the image. We do this at draw time rather than post image. When a user creates a text box, its position (described in a way that is best understood by an LLM) and text are put into the image metadata

Metadata example: 

in this image there are 10 elements. 

1. In top left quadrant, below element 2. there's a textbox with the following text "Hello world" 
2. In the top left corner, there's a textbox with the following text "Testtesttest" 

Intersection:
elements 1 & 2 may overlap as their bounding boxes intersect but not strongly

Style:
element 1's text is times new roman 12pt
element 2's text is arial 3pt

