/**
 * @file jenkinsfile parser
 * @copyright Copyright (c) 2022-2023 jevin.shi
 * @email jevin.shj@gmail.com
 */

import type {
  Statement,
  Closure,
  FunctionCallExpression,
} from "./tiny-groovy-parser";
import { STATEMENT_TYPE, EXPRESSION_TYPE } from "./tiny-groovy-parser";
import * as groovyParser from "./tiny-groovy-parser";

export enum DIRECTIVE_TYPE {
  PIPELINE = "pipeline",
  STAGES = "stages",
  STAGE = "stage",
  PARALLEL = "parallel",
  CONTAINER = "container",
  STEPS = "steps",
  STEP = "__function_identifier__",
}

export type PipelineDirective = {
  type: DIRECTIVE_TYPE.PIPELINE;
  expr?: FunctionCallExpression;
  closure?: Closure;
  stages?: StagesDirective;
};

export type StagesDirective = {
  type: DIRECTIVE_TYPE.STAGES;
  expr?: FunctionCallExpression;
  closure?: Closure;
  stage?: StageDirective[];
};

export type StageDirective = {
  type: DIRECTIVE_TYPE.STAGE;
  expr?: FunctionCallExpression;
  closure?: Closure;
  name: string;
  parallel?: ParallelDirective;
  steps?: StepsDirective;
};

export type ParallelDirective = {
  type: DIRECTIVE_TYPE.PARALLEL;
  expr?: FunctionCallExpression;
  closure?: Closure;
  stage?: StageDirective[];
};

export type StepsDirective = {
  type: DIRECTIVE_TYPE.STEPS;
  expr?: FunctionCallExpression;
  closure?: Closure;
  steps?: StepDirective[];
  container?: ContainerDirective;
};

export type ContainerDirective = {
  type: DIRECTIVE_TYPE.CONTAINER;
  expr?: FunctionCallExpression;
  closure?: Closure;
  name: string;
  steps?: StepDirective[];
};

export type StepDirective = {
  type: DIRECTIVE_TYPE.STEP;
  expr?: FunctionCallExpression;
  name: string;
  params: any[];
  src: string;
  serializePrefer?: string;
};

export type Directive =
  | PipelineDirective
  | StagesDirective
  | StageDirective
  | ParallelDirective
  | StepsDirective
  | ContainerDirective
  | StepDirective;

export function parse(
  statements: Statement[],
  script: string
): PipelineDirective {
  let pipeline: PipelineDirective;
  let context: Exclude<Directive, StepDirective>;

  statements.forEach((statement) => {
    groovyParser.traverse(statement, (expr, parent) => {
      const getDirName = (exp: FunctionCallExpression) => {
        if (exp.params.length) {
          switch (exp.params[0].expr.type) {
            case EXPRESSION_TYPE.STRING_LITERAL: {
              return exp.params[0].expr.value;
            }
            case EXPRESSION_TYPE.G_STRING: {
              return exp.params[0].expr.values[0] as string;
            }
            default:
              return;
          }
        } else {
          return;
        }
      };

      if (context) {
        switch (context.type) {
          case DIRECTIVE_TYPE.PIPELINE: {
            if (
              expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
              expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
              expr.name.name === DIRECTIVE_TYPE.STAGES &&
              context.closure === parent
            ) {
              context.stages = {
                type: DIRECTIVE_TYPE.STAGES,
                expr,
                closure: expr.params[expr.params.length - 1].expr as Closure,
              };
              const lastContext = context;
              context = context.stages;
              return () => {
                context = lastContext;
              };
            }
            break;
          }

          case DIRECTIVE_TYPE.PARALLEL:
          case DIRECTIVE_TYPE.STAGES: {
            if (
              expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
              expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
              expr.name.name === DIRECTIVE_TYPE.STAGE &&
              context.closure === parent
            ) {
              context.stage = context.stage || [];
              context.stage.push({
                type: DIRECTIVE_TYPE.STAGE,
                expr,
                closure: expr.params[expr.params.length - 1].expr as Closure,
                name: getDirName(expr) || "",
              });
              const lastContext = context;
              context = context.stage[context.stage.length - 1];
              return () => {
                context = lastContext;
              };
            }
            break;
          }

          case DIRECTIVE_TYPE.STAGE: {
            if (
              expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
              expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
              expr.name.name === DIRECTIVE_TYPE.PARALLEL &&
              context.closure === parent
            ) {
              context.parallel = {
                type: DIRECTIVE_TYPE.PARALLEL,
                expr,
                closure: expr.params[expr.params.length - 1].expr as Closure,
              };
              const lastContext = context;
              context = context.parallel;
              return () => {
                context = lastContext;
              };
            }

            if (
              expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
              expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
              expr.name.name === DIRECTIVE_TYPE.STEPS &&
              context.closure === parent
            ) {
              context.steps = {
                type: DIRECTIVE_TYPE.STEPS,
                expr,
                closure: expr.params[expr.params.length - 1].expr as Closure,
              };
              const lastContext = context;
              context = context.steps;
              return () => {
                context = lastContext;
              };
            }
            break;
          }

          case DIRECTIVE_TYPE.STEPS: {
            if (
              expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
              expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
              expr.name.name === DIRECTIVE_TYPE.CONTAINER &&
              context.closure === parent
            ) {
              context.container = {
                type: DIRECTIVE_TYPE.CONTAINER,
                expr,
                closure: expr.params[expr.params.length - 1].expr as Closure,
                name: getDirName(expr) || "",
              };
              const lastContext = context;
              context = context.container;
              return () => {
                context = lastContext;
              };
            }

            if (
              expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
              expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
              context.closure === parent
            ) {
              const params: any[] = [];

              expr.params.forEach((param) => {
                const val = groovyParser.toJSON(param.expr);
                if (param.name) {
                  params[0] = params[0] || {};
                  params[0][param.name] = val;
                } else {
                  params.push(val);
                }
              });
              context.steps = context.steps || [];
              context.steps.push({
                type: DIRECTIVE_TYPE.STEP,
                expr,
                name: expr.name.name,
                src: script.slice(expr.start, expr.end),
                params,
              });
              return;
            }
            break;
          }

          case DIRECTIVE_TYPE.CONTAINER: {
            if (
              expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
              expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
              context.closure === parent
            ) {
              const params: any[] = [];

              expr.params.forEach((param) => {
                const val = groovyParser.toJSON(param.expr);
                if (param.name) {
                  params[0] = params[0] || {};
                  params[0][param.name] = val;
                } else {
                  params.push(val);
                }
              });
              context.steps = context.steps || [];
              context.steps.push({
                type: DIRECTIVE_TYPE.STEP,
                expr,
                name: expr.name.name,
                src: script.slice(expr.start, expr.end),
                params,
              });
              return;
            }
            break;
          }

          default:
            break;
        }
      } else if (
        expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
        expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
        expr.name.name === DIRECTIVE_TYPE.PIPELINE
      ) {
        context = pipeline = {
          type: DIRECTIVE_TYPE.PIPELINE,
          expr,
          closure: expr.params[expr.params.length - 1].expr as Closure,
        };
      }
      return;
    });
  });

  // @ts-ignore
  return pipeline;
}

export function createAST(dir: Directive): FunctionCallExpression {
  switch (dir.type) {
    case DIRECTIVE_TYPE.PIPELINE: {
      const statements = groovyParser.parse("pipeline {}");
      const expr = statements[0].expr as FunctionCallExpression;
      const closure = expr.params[0].expr as Closure;

      if (dir.stages) {
        closure.statements.push({
          type: STATEMENT_TYPE.EXPRESSION,
          expr: dir.stages.expr || createAST(dir.stages),
        });
      }
      dir.expr = expr;
      dir.closure = closure;
      return expr;
    }

    case DIRECTIVE_TYPE.STAGES: {
      const statements = groovyParser.parse("stages {}");
      const expr = statements[0].expr as FunctionCallExpression;
      const closure = expr.params[0].expr as Closure;

      if (dir.stage) {
        dir.stage.forEach((stageDir) => {
          closure.statements.push({
            type: STATEMENT_TYPE.EXPRESSION,
            expr: stageDir.expr || createAST(stageDir),
          });
        });
      }
      dir.expr = expr;
      dir.closure = closure;
      return expr;
    }

    case DIRECTIVE_TYPE.STAGE: {
      const statements = groovyParser.parse(
        dir.name ? `stage("${dir.name}") {}` : "stage {}"
      );
      const expr = statements[0].expr as FunctionCallExpression;
      const closure = expr.params[dir.name ? 1 : 0].expr as Closure;

      if (dir.parallel) {
        closure.statements.push({
          type: STATEMENT_TYPE.EXPRESSION,
          expr: dir.parallel.expr || createAST(dir.parallel),
        });
      } else if (dir.steps) {
        closure.statements.push({
          type: STATEMENT_TYPE.EXPRESSION,
          expr: dir.steps.expr || createAST(dir.steps),
        });
      }
      dir.expr = expr;
      dir.closure = closure;
      return expr;
    }

    case DIRECTIVE_TYPE.PARALLEL: {
      const statements = groovyParser.parse("parallel {}");
      const expr = statements[0].expr as FunctionCallExpression;
      const closure = expr.params[0].expr as Closure;

      if (dir.stage) {
        dir.stage.forEach((stageDir) => {
          closure.statements.push({
            type: STATEMENT_TYPE.EXPRESSION,
            expr: stageDir.expr || createAST(stageDir),
          });
        });
      }
      dir.expr = expr;
      dir.closure = closure;
      return expr;
    }

    case DIRECTIVE_TYPE.CONTAINER: {
      const statements = groovyParser.parse(`container("${dir.name}") {}`);
      const expr = statements[0].expr as FunctionCallExpression;
      const closure = expr.params[1].expr as Closure;

      if (dir.steps) {
        dir.steps.forEach((stepDir) => {
          closure.statements.push({
            type: STATEMENT_TYPE.EXPRESSION,
            expr: stepDir.expr || createAST(stepDir),
          });
        });
      }
      dir.expr = expr;
      dir.closure = closure;
      return expr;
    }

    case DIRECTIVE_TYPE.STEPS: {
      const statements = groovyParser.parse(`steps {}`);
      const expr = statements[0].expr as FunctionCallExpression;
      const closure = expr.params[0].expr as Closure;

      if (dir.steps) {
        dir.steps.forEach((stepDir) => {
          closure.statements.push({
            type: STATEMENT_TYPE.EXPRESSION,
            expr: stepDir.expr || createAST(stepDir),
          });
        });
      }
      if (dir.container) {
        closure.statements.push({
          type: STATEMENT_TYPE.EXPRESSION,
          expr: dir.container.expr || createAST(dir.container),
        });
      }
      dir.expr = expr;
      dir.closure = closure;
      return expr;
    }

    case DIRECTIVE_TYPE.STEP: {
      if (dir.serializePrefer === "src") {
        const statements = groovyParser.parse(dir.src);
        dir.expr = statements[0].expr as FunctionCallExpression;
        return dir.expr;
      }

      const statements = groovyParser.parse(`${dir.name}()`);
      dir.expr = statements[0].expr as FunctionCallExpression;
      dir.expr.params = dir.params.map((param) => ({
        expr: groovyParser.fromJSON(param),
      }));
      return dir.expr;
    }
  }
}

export function updateAST(dir: Directive): FunctionCallExpression {
  const removeAllChildDirs = (
    parentDir: Exclude<Directive, StepDirective>,
    childDirType?: DIRECTIVE_TYPE
  ) => {
    parentDir.closure!.statements = parentDir.closure!.statements.filter(
      (statement) =>
        statement.type !== STATEMENT_TYPE.EXPRESSION ||
        statement.expr.type !== EXPRESSION_TYPE.FUNCTION_CALL ||
        statement.expr.name.type !== EXPRESSION_TYPE.IDENTIFIER ||
        (childDirType && statement.expr.name.name !== childDirType)
    );
  };

  const updateChildDirs = (
    parentDir: Exclude<Directive, StepDirective>,
    childDirs: Directive[]
  ) => {
    const statements = parentDir.closure!.statements.filter(
      (statement) =>
        statement.type === STATEMENT_TYPE.EXPRESSION &&
        statement.expr.type === EXPRESSION_TYPE.FUNCTION_CALL &&
        statement.expr.name.type === EXPRESSION_TYPE.IDENTIFIER &&
        (childDirs[0].type === DIRECTIVE_TYPE.STEP ||
          childDirs[0].type === statement.expr.name.name)
    );
    const removed = statements.slice(childDirs.length);

    parentDir.closure!.statements = parentDir.closure!.statements.filter(
      (item) => !removed.includes(item)
    );
    childDirs.forEach((child, i) => {
      if (statements[i]) {
        statements[i].expr = child.expr!;
      } else {
        parentDir.closure!.statements.push({
          type: STATEMENT_TYPE.EXPRESSION,
          expr: child.expr!,
        });
      }
    });
  };

  const updateDirName = (d: StageDirective | ContainerDirective) => {
    switch (d.expr?.params[0]?.expr.type) {
      case EXPRESSION_TYPE.STRING_LITERAL: {
        d.expr.params[0].expr.value = d.name;
        break;
      }
      case EXPRESSION_TYPE.G_STRING: {
        d.expr.params[0].expr.values = [d.name];
        break;
      }
      default:
        break;
    }
  };

  switch (dir.type) {
    case DIRECTIVE_TYPE.PIPELINE: {
      if (!dir.expr) createAST(dir);
      if (dir.stages) {
        updateAST(dir.stages);
        updateChildDirs(dir, [dir.stages]);
      } else {
        removeAllChildDirs(dir, DIRECTIVE_TYPE.STAGES);
      }
      break;
    }

    case DIRECTIVE_TYPE.PARALLEL:
    case DIRECTIVE_TYPE.STAGES: {
      if (!dir.expr) createAST(dir);
      if (dir.stage) {
        dir.stage.forEach((item) => updateAST(item));
        updateChildDirs(dir, dir.stage);
      } else {
        removeAllChildDirs(dir, DIRECTIVE_TYPE.STAGE);
      }
      break;
    }

    case DIRECTIVE_TYPE.STAGE: {
      if (!dir.expr) createAST(dir);
      updateDirName(dir);
      if (dir.parallel) {
        updateAST(dir.parallel);
        updateChildDirs(dir, [dir.parallel]);
      } else if (dir.steps) {
        updateAST(dir.steps);
        updateChildDirs(dir, [dir.steps]);
      } else {
        removeAllChildDirs(dir, DIRECTIVE_TYPE.PARALLEL);
        removeAllChildDirs(dir, DIRECTIVE_TYPE.STEPS);
      }
      break;
    }

    case DIRECTIVE_TYPE.CONTAINER: {
      if (!dir.expr) createAST(dir);
      updateDirName(dir);
      if (dir.steps) {
        dir.steps.forEach((item) => updateAST(item));
        updateChildDirs(dir, dir.steps);
      } else {
        removeAllChildDirs(dir);
      }
      break;
    }

    case DIRECTIVE_TYPE.STEPS: {
      if (!dir.expr) createAST(dir);
      if (dir.container) {
        updateAST(dir.container);
        updateChildDirs(dir, [dir.container]);
      } else if (dir.steps) {
        dir.steps.forEach((item) => updateAST(item));
        updateChildDirs(dir, dir.steps);
      } else {
        removeAllChildDirs(dir);
      }
      break;
    }

    case DIRECTIVE_TYPE.STEP: {
      createAST(dir);
      break;
    }
  }

  return dir.expr!;
}
