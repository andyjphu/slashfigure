import type { Tool } from "./Tool";
import { SelectTool } from "./SelectTool";
import { RectangleTool } from "./RectangleTool";
import { TextTool } from "./TextTool";
import { ArrowTool } from "./ArrowTool";
import { FreehandTool } from "./FreehandTool";
import { EquationTool } from "./EquationTool";

/**
 * Registry of all available tools.
 * Adding a new tool = create the Tool class + add one line here.
 */
export function createToolRegistry(): Map<string, Tool> {
  const tools = new Map<string, Tool>();

  const register = (tool: Tool) => tools.set(tool.id, tool);

  register(new SelectTool());
  register(new RectangleTool());
  register(new TextTool());
  register(new ArrowTool());
  register(new FreehandTool());
  register(new EquationTool());

  return tools;
}
