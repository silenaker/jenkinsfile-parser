/**
 * @file Groovy parser dedicated for jenkinsfile
 * @copyright Copyright (c) 2022-2023 jevin.shi
 * @email jevin.shj@gmail.com
 */

enum TOKEN_TYPE {
  KEYWORD,
  IDENTIFIER,
  STRING,
  G_STRING,
  NUMBER,
  BOOLEAN,
  BRACKET, // "()[]{}"
  OPERATOR, // ".="
  SEPARATOR, // ";\n,:->"
  COMMENT,
}

export enum EXPRESSION_TYPE {
  IDENTIFIER = "Identifier",
  STRING_LITERAL = "StringLiteral",
  G_STRING = "GString",
  NUMBER_LITERAL = "NumberLiteral",
  BOOLEAN_LITERAL = "BooleanLiteral",
  SET_LITERAL = "SetLiteral",
  MAP_LITERAL = "MapLiteral",
  NULL = "Null",
  BRACKET = "Bracket",
  CLOSURE = "Closure",
  MEMBER_ACCESS = "MemberAccess",
  FUNCTION_CALL = "FunctionCall",
  ASSIGNMENT = "Assignment",
}

export enum STATEMENT_TYPE {
  EXPRESSION = "Expression",
}

type Token = {
  type: TOKEN_TYPE;
  start: number;
  end: number;
  src: string;
};

export type Identifier = {
  type: EXPRESSION_TYPE.IDENTIFIER;
  start: number;
  end: number;
  name: string;
};

export type StringLiteral = {
  type: EXPRESSION_TYPE.STRING_LITERAL;
  start: number;
  end: number;
  value: string;
};

export type GString = {
  type: EXPRESSION_TYPE.G_STRING;
  start: number;
  end: number;
  values: (string | Expression)[];
};

export type NumberLiteral = {
  type: EXPRESSION_TYPE.NUMBER_LITERAL;
  start: number;
  end: number;
  value: number;
};

export type BooleanLiteral = {
  type: EXPRESSION_TYPE.BOOLEAN_LITERAL;
  start: number;
  end: number;
  value: boolean;
};

export type SetLiteral = {
  type: EXPRESSION_TYPE.SET_LITERAL;
  start: number;
  end: number;
  exprs: Expression[];
};

export type MapLiteral = {
  type: EXPRESSION_TYPE.MAP_LITERAL;
  start: number;
  end: number;
  exprs: { key: string; expr: Expression }[];
};

export type Null = {
  type: EXPRESSION_TYPE.NULL;
  start: number;
  end: number;
};

export type BracketExpression = {
  type: EXPRESSION_TYPE.BRACKET;
  start: number;
  end: number;
  expr: Expression;
};

export type Closure = {
  type: EXPRESSION_TYPE.CLOSURE;
  start: number;
  end: number;
  params: string[];
  statements: Statement[];
  src?: string;
  error?: string;
};

export type MemberAccessExpression = {
  type: EXPRESSION_TYPE.MEMBER_ACCESS;
  start: number;
  end: number;
  left: Expression;
  right: Expression | string;
};

export type FunctionCallExpression = {
  type: EXPRESSION_TYPE.FUNCTION_CALL;
  start: number;
  end: number;
  name: Expression;
  params: { name?: string; expr: Expression }[];
};

export type AssignmentExpression = {
  type: EXPRESSION_TYPE.ASSIGNMENT;
  start: number;
  end: number;
  left: Identifier | MemberAccessExpression;
  right: Expression;
};

export type Expression =
  | Identifier
  | StringLiteral
  | GString
  | NumberLiteral
  | BooleanLiteral
  | SetLiteral
  | MapLiteral
  | Null
  | BracketExpression
  | Closure
  | MemberAccessExpression
  | FunctionCallExpression
  | AssignmentExpression;

export type ExpressionStatement = {
  type: STATEMENT_TYPE.EXPRESSION;
  expr: Expression;
};

export type Statement = ExpressionStatement;

/*
 * we defined operator types used for operations that expect right expressions
 * which are also others' expected left expressions and these that participate
 * in this competition, we will use stack to solve expression compositing priorities.
 */
enum OPERATOR_TYPE {
  MEMBER_ACCESS,
  FUNCTION_CALL,
  ASSIGNMENT,
}

type Operator = {
  type: OPERATOR_TYPE;
  priority: number;
};

const PRIORITY_LEVEL = [
  [OPERATOR_TYPE.ASSIGNMENT],
  [OPERATOR_TYPE.FUNCTION_CALL],
  [OPERATOR_TYPE.MEMBER_ACCESS],
];

/* keywords use for constructing expressions or statements */
const keywords = [
  "as",
  "assert",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "def",
  "default",
  "do",
  "else",
  "enum",
  "extends",
  "false",
  "finally",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "new",
  "null",
  "package",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "throws",
  "trait",
  "true",
  "try",
  "while",
];

const getOperatorPriority = (type: OPERATOR_TYPE) => {
  return PRIORITY_LEVEL.findIndex((item) => item.includes(type));
};

const getOperatorType = (token: Token) => {
  switch (token.src) {
    case "=":
      return OPERATOR_TYPE.ASSIGNMENT;
    case ".":
      return OPERATOR_TYPE.MEMBER_ACCESS;
    default:
      throw new Error(`unexpected syntax: ${token.src}`);
  }
};

function tokenizer(code: string): Token[] {
  const tokens: Token[] = [];
  let off = 0;
  let token: Token | false | undefined;

  /*
   * trim newlines on sides of operators which expect expressions
   * don't trim newlines on sides of expressions
   */
  const trimLeadingNewline = () => {
    const lastToken = tokens[tokens.length - 1];
    if (lastToken && lastToken.src === "\n") tokens.pop();
  };

  const shouldAddNewline = () => {
    const lastToken = tokens[tokens.length - 1];
    if (
      !lastToken ||
      lastToken.type === TOKEN_TYPE.KEYWORD ||
      lastToken.type === TOKEN_TYPE.OPERATOR ||
      lastToken.type === TOKEN_TYPE.SEPARATOR ||
      ["(", "[", "{"].includes(lastToken.src)
    ) {
      return false;
    }
    return true;
  };

  const scanners = [
    {
      starter: ["true", "false"],
      scan: function (): Token {
        const start = off;
        const bool = code.slice(off, off + 4) === "true";

        off += bool ? 4 : 5;
        return {
          start,
          end: off,
          type: TOKEN_TYPE.BOOLEAN,
          src: bool + "",
        };
      },
    },
    {
      starter: /[a-zA-Z$_]/,
      scan: function (): Token {
        const start = off;
        const lastToken = tokens[tokens.length - 1];
        const pattern =
          /[$\w\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff\u0100-\ufffe]/;

        while (code.charAt(off) && pattern.test(code.charAt(off))) {
          off++;
        }
        const text = code.slice(start, off);
        return {
          start,
          end: off,
          type:
            keywords.includes(text) && (!lastToken || lastToken.src !== ".")
              ? TOKEN_TYPE.KEYWORD
              : TOKEN_TYPE.IDENTIFIER,
          src: text,
        };
      },
    },
    {
      starter: /['"]/,
      scan: function (): Token {
        const start = off;
        const quote = code.charAt(off);
        const type = quote === "'" ? TOKEN_TYPE.STRING : TOKEN_TYPE.G_STRING;
        let singleLine = false;

        if (code.slice(off, off + 3) === quote + quote + quote) {
          off += 3;
        } else {
          singleLine = true;
          off++;
        }

        let esc = false;

        loop: while (true) {
          if (!code.charAt(off)) break;
          switch (code.charAt(off)) {
            case "\\":
              esc = !esc;
              break;
            case quote: {
              if (
                !esc &&
                (singleLine ||
                  code.slice(off, off + 3) === quote + quote + quote)
              ) {
                break loop;
              }
              esc = false;
              break;
            }
            case "\n": {
              if (singleLine) break loop;
              esc = false;
              break;
            }
            default:
              esc = false;
              break;
          }
          off++;
        }
        if (!code.charAt(off)) {
          throw Error("unexpected token: EOF");
        }
        if (singleLine && code.charAt(off) === "\n") {
          throw Error("unexpected token: \n");
        }
        off += singleLine ? 1 : 3;
        return {
          start,
          end: off,
          type,
          src: code.slice(start, off),
        };
      },
    },
    {
      starter: /[()\[\]{}]/,
      scan: function (): Token {
        if (!["{", "}"].includes(code.charAt(off))) trimLeadingNewline();
        return {
          start: off,
          end: off + 1,
          type: TOKEN_TYPE.BRACKET,
          src: code.charAt(off++),
        };
      },
    },
    {
      starter: /[.=]/,
      scan: function (): Token {
        trimLeadingNewline();
        return {
          start: off,
          end: off + 1,
          type: TOKEN_TYPE.OPERATOR,
          src: code.charAt(off++),
        };
      },
    },
    {
      starter: [/[\n;,:]/, "->"],
      scan: function (): Token | false {
        if (code.charAt(off) === "\n" && !shouldAddNewline()) {
          off++;
          return false;
        }
        trimLeadingNewline();
        if (code.slice(off, off + 2) === "->") {
          const start = off;
          off += 2;
          return {
            start,
            end: off,
            type: TOKEN_TYPE.SEPARATOR,
            src: "->",
          };
        } else {
          return {
            start: off,
            end: off + 1,
            type: TOKEN_TYPE.SEPARATOR,
            src: code.charAt(off++),
          };
        }
      },
    },
    {
      starter: "/",
      scan: function (): Token | false {
        let singleLine = false;

        switch (code.charAt(++off)) {
          case "/":
            singleLine = true;
            break;
          case "*":
            break;
          default:
            throw Error("unexpected token: /");
        }
        do {
          off++;
        } while (
          singleLine
            ? code.charAt(off) !== "\n"
            : code.slice(off, off + 2) !== "*/"
        );
        if (!singleLine) off += 2;
        return false;
      },
    },
  ];

  function scanToken() {
    while (code.charAt(off) && code.charAt(off).match(/[^\S\n]/)) off++;
    if (!code.charAt(off)) return;

    for (let i = 0; i < scanners.length; i++) {
      const scanner = scanners[i];
      const starter = Array.isArray(scanner.starter)
        ? scanner.starter
        : [scanner.starter];
      if (
        starter.some(
          // eslint-disable-next-line @typescript-eslint/no-loop-func
          (item) =>
            (typeof item === "string" &&
              item === code.slice(off, off + item.length)) ||
            (item instanceof RegExp && item.test(code.charAt(off)))
        )
      ) {
        return scanner.scan();
      }
    }
    throw Error(`unexpected token: ${code.charAt(off)}`);
  }

  do {
    token = scanToken();
    if (token) tokens.push(token);
  } while (token !== undefined);
  return tokens;
}

function parseSyntax(tokens: Token[], code: string): Statement[] {
  let off = 0;

  function parseFuncCallExpr(
    name: Expression,
    term: (token: Token) => boolean,
    eof?: boolean,
    resetTermOffset?: boolean
  ): FunctionCallExpression {
    const params = parseParameterList(term, eof);

    if (term(tokens[off - 1]) && resetTermOffset) off--;
    while (tokens[off] && tokens[off].src === "{") {
      off++;
      params.push({ expr: parseClosureExpr() });
    }
    return {
      type: EXPRESSION_TYPE.FUNCTION_CALL,
      start: name.start,
      end: tokens[off - 1].end,
      name,
      params,
    };
  }

  function parseClosureExpr(): Closure {
    const start = off;
    const openToken = tokens[start - 1];
    let params: string[] = [];
    let statements: Statement[] = [];
    let error: Error, closeToken: Token;

    try {
      params = parseParamDeclarations((token: Token) => token.src === "->");
    } catch (err) {
      /* find no params declarations, reset pointer */
      off = start;
    } finally {
      try {
        statements = parseStatements((token: Token) => {
          if (token.src === "}") {
            closeToken = token;
            return true;
          }
          return false;
        });
        return {
          type: EXPRESSION_TYPE.CLOSURE,
          start: openToken.start,
          end: closeToken!.end,
          params,
          statements,
        };
      } catch (err) {
        /* find syntax errors */
        error = err as Error;
        off = start;
        let token = tokens[off];
        let count = 0;

        while (token && (token.src !== "}" || count > 0)) {
          if (token.src === "{") count++;
          if (token.src === "}") count--;
          token = tokens[++off];
        }
        if (token) {
          closeToken = token;
          off++;
          return {
            type: EXPRESSION_TYPE.CLOSURE,
            start: openToken.start,
            end: closeToken.end,
            src: code.slice(openToken.start, closeToken.end),
            params,
            statements,
            error: error.message,
          };
        } else {
          throw new Error("unexpected syntax: EOF");
        }
      }
    }
  }

  function parseParamDeclarations(term: (token: Token) => boolean) {
    const params = [];
    let token;
    let expect = (tok: Token) => tok && tok.type === TOKEN_TYPE.IDENTIFIER;

    while (true) {
      token = tokens[off++];
      if (!expect(token)) {
        throw new Error(`unexpected syntax: ${token ? token.src : "EOF"}`);
      }
      if (token.type === TOKEN_TYPE.IDENTIFIER) {
        params.push(token.src);
        expect = (tok: Token) => tok && (tok.src === "," || term(tok));
      } else if (token.src === ",") {
        expect = (tok: Token) => tok && tok.type === TOKEN_TYPE.IDENTIFIER;
      } else {
        break;
      }
    }
    return params;
  }

  function parseParameterList(term: (token: Token) => boolean, eof?: boolean) {
    const params: any[] = [];
    let terms = [":", ","];
    let expr: Expression,
      sep: string,
      lastSep: string | undefined,
      termToken: Token;

    loop: while (true) {
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      expr = parseExpr((token) => {
        if (terms.includes(token.src) || term(token)) {
          sep = token.src;
          termToken = token;
          return true;
        }
        return false;
      }, eof);
      /* handle EOF case */
      if (off >= tokens.length) {
        sep = "EOF";
        termToken = { src: "EOF" } as Token;
      }
      switch (sep!) {
        case ":": {
          if (!expr || expr.type !== EXPRESSION_TYPE.IDENTIFIER) {
            throw new Error("unexpected syntax: :");
          }
          params.push({ name: expr.name });
          terms = [","];
          lastSep = sep;
          break;
        }
        case ",": {
          if (!expr) throw new Error("unexpected syntax: ,");
          if (lastSep === ":") {
            params[params.length - 1].expr = expr;
            terms = [":", ","];
          } else {
            terms = [","];
            params.push({ expr });
          }
          lastSep = sep;
          break;
        }
        default: {
          // no params case
          if (!expr && !lastSep) break loop;
          // we allow trailing ','
          if (!expr && lastSep !== ",")
            throw new Error(`unexpected syntax: ${termToken!.src}`);
          if (lastSep === ":") {
            params[params.length - 1].expr = expr;
          } else if (expr) {
            // we don't need to push undefined params for trailing ',' cases
            params.push({ expr });
          }
          break loop;
        }
      }
    }
    return params;
  }

  function parseSetOrMapLiterals(): SetLiteral | MapLiteral {
    const start = off - 1;
    const exprs: any[] = [];
    let terms = [":", ",", "]"];
    let expr: Expression,
      sep: string,
      lastSep: string | undefined,
      termToken: Token;

    loop: while (true) {
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      expr = parseExpr((token) => {
        if (terms.includes(token.src)) {
          sep = token.src;
          termToken = token;
          return true;
        }
        return false;
      });
      switch (sep!) {
        case ":": {
          if (!expr || expr.type !== EXPRESSION_TYPE.IDENTIFIER) {
            throw new Error("unexpected syntax: :");
          }
          // @ts-ignore
          exprs.push({ key: expr.name });
          terms = [",", "]"];
          lastSep = sep;
          break;
        }
        case ",": {
          if (!expr) throw new Error("unexpected syntax: ,");
          if (lastSep === ":") {
            exprs[exprs.length - 1].expr = expr;
            terms = [":", "]"];
          } else {
            terms = [",", "]"];
            exprs.push(expr);
          }
          lastSep = sep;
          break;
        }
        default: {
          // no elements
          if (!expr && !lastSep) break loop;
          if (!expr) throw new Error(`unexpected syntax: ${termToken!.src}`);
          if (lastSep === ":") {
            exprs[exprs.length - 1].expr = expr;
          } else {
            exprs.push(expr);
          }
          break loop;
        }
      }
    }

    return {
      type:
        !exprs.length || !exprs[0].key
          ? EXPRESSION_TYPE.SET_LITERAL
          : EXPRESSION_TYPE.MAP_LITERAL,
      start,
      end: termToken!.end,
      exprs,
    };
  }

  function parseExpr(term: (token: Token) => boolean, eof?: boolean) {
    const exprs: Expression[] = [];
    const operators: Operator[] = [];
    let expectExpr = 0;

    function composeExpr(priority?: number) {
      let operator = operators[operators.length - 1];

      if (expectExpr > 0) throw new Error("unexpected syntax: EOF");
      while (
        operator &&
        (priority === undefined || operator.priority >= priority)
      ) {
        // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
        switch (operator.type) {
          case OPERATOR_TYPE.MEMBER_ACCESS: {
            /* left and right expressions must exist because of expectExpr mechanism */
            const right = exprs.pop();
            const left = exprs.pop();
            if (
              right!.type !== EXPRESSION_TYPE.IDENTIFIER &&
              right!.type !== EXPRESSION_TYPE.STRING_LITERAL &&
              right!.type !== EXPRESSION_TYPE.G_STRING
            ) {
              throw new Error(`unexpected syntax: .`);
            }
            exprs.push({
              type: EXPRESSION_TYPE.MEMBER_ACCESS,
              start: left!.start,
              end: right.end,
              left: left as Expression,
              right,
            });
            break;
          }
          case OPERATOR_TYPE.ASSIGNMENT: {
            const right = exprs.pop();
            const left = exprs.pop();

            if (
              left!.type !== EXPRESSION_TYPE.IDENTIFIER &&
              left!.type !== EXPRESSION_TYPE.MEMBER_ACCESS
            ) {
              throw new Error(`unexpected syntax: =`);
            }
            exprs.push({
              type: EXPRESSION_TYPE.ASSIGNMENT,
              start: left.start,
              end: right!.end,
              left,
              right: right as Expression,
            });
            break;
          }
        }
        operators.pop();
        operator = operators[operators.length - 1];
      }
    }

    while (tokens[off] && !term(tokens[off])) {
      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
      switch (tokens[off].type) {
        case TOKEN_TYPE.IDENTIFIER:
        case TOKEN_TYPE.STRING:
        case TOKEN_TYPE.G_STRING:
        case TOKEN_TYPE.BOOLEAN: {
          // function call
          if (!expectExpr && exprs.length) {
            composeExpr(getOperatorPriority(OPERATOR_TYPE.FUNCTION_CALL));
          }
          if ((!expectExpr && exprs.length) || expectExpr === -1) {
            exprs.push(
              parseFuncCallExpr(exprs.pop() as Expression, term, eof, true)
            );
            break;
          }

          // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
          switch (tokens[off].type) {
            case TOKEN_TYPE.IDENTIFIER: {
              exprs.push({
                type: EXPRESSION_TYPE.IDENTIFIER,
                start: tokens[off].start,
                end: tokens[off].end,
                name: tokens[off].src,
              });
              break;
            }

            case TOKEN_TYPE.STRING: {
              const l = tokens[off].src.slice(0, 3) === "'''" ? 3 : 1;
              exprs.push({
                type: EXPRESSION_TYPE.STRING_LITERAL,
                start: tokens[off].start,
                end: tokens[off].end,
                value: unescape(tokens[off].src.slice(l, -l), true), // jenkins seem support single quote interpolation
              });
              break;
            }

            case TOKEN_TYPE.G_STRING: {
              const l = tokens[off].src.slice(0, 3) === '"""' ? 3 : 1;
              // TODO
              // need to split string literal and expressions
              exprs.push({
                type: EXPRESSION_TYPE.G_STRING,
                start: tokens[off].start,
                end: tokens[off].end,
                values: [unescape(tokens[off].src.slice(l, -l), true)],
              });
              break;
            }

            case TOKEN_TYPE.BOOLEAN: {
              exprs.push({
                type: EXPRESSION_TYPE.BOOLEAN_LITERAL,
                start: tokens[off].start,
                end: tokens[off].end,
                value: tokens[off].src === "true",
              });
              break;
            }
          }
          expectExpr--;
          off++;
          break;
        }

        case TOKEN_TYPE.BRACKET: {
          switch (tokens[off].src) {
            case "(": {
              // function call
              if (!expectExpr && exprs.length) {
                composeExpr(getOperatorPriority(OPERATOR_TYPE.FUNCTION_CALL));
              }
              if ((!expectExpr && exprs.length) || expectExpr === -1) {
                off++;
                exprs.push(
                  parseFuncCallExpr(
                    exprs.pop() as Expression,
                    (token) => token.src === ")"
                  )
                );
                break;
              }

              // bracket expressions
              const openToken = tokens[off++];
              const closeBracket = ")";
              let closeToken: Token;

              const expr = parseExpr((token: Token) => {
                if (token.src === closeBracket) {
                  closeToken = token;
                  return true;
                }
                return false;
              });
              if (!expr) throw new Error(`unexpected syntax: ${closeBracket}`);

              exprs.push({
                type: EXPRESSION_TYPE.BRACKET,
                start: openToken.start,
                end: closeToken!.end,
                expr,
              });
              expectExpr--;
              break;
            }

            case "[": {
              // dynamic member access
              if (!expectExpr && exprs.length) {
                composeExpr(getOperatorPriority(OPERATOR_TYPE.MEMBER_ACCESS));
              }
              if ((!expectExpr && exprs.length) || expectExpr === -1) {
                let closeToken: Token;
                off++;
                const left = exprs.pop();
                const right = parseExpr((token) => {
                  if (token.src === "]") {
                    closeToken = token;
                    return true;
                  }
                  return false;
                });

                if (!right) throw new Error(`unexpected syntax: ]`);
                exprs.push({
                  type: EXPRESSION_TYPE.MEMBER_ACCESS,
                  start: left!.start,
                  end: closeToken!.end,
                  left: left as Expression,
                  right,
                });
                break;
              }
              // Map/Set Literal
              off++;
              exprs.push(parseSetOrMapLiterals());
              expectExpr--;
              break;
              // throw new Error(`unexpected syntax: [`);
            }

            case "{": {
              // function call
              if (!expectExpr && exprs.length) {
                composeExpr(getOperatorPriority(OPERATOR_TYPE.FUNCTION_CALL));
              }
              if ((!expectExpr && exprs.length) || expectExpr === -1) {
                exprs.push(
                  parseFuncCallExpr(exprs.pop() as Expression, term, eof, true)
                );
                break;
              }

              off++;
              exprs.push(parseClosureExpr());
              expectExpr--;
              break;
            }

            default:
              throw new Error(`unexpected syntax: ${tokens[off].src}`);
          }
          break;
        }

        case TOKEN_TYPE.OPERATOR: {
          switch (tokens[off].src) {
            default: {
              /*
               * default case used for operations that need to delay
               * compositing which will trigger by low priority operators
               * e.g. =.
               */
              const type = getOperatorType(tokens[off]);
              const priority = getOperatorPriority(type);

              if (expectExpr !== -1 && (expectExpr || !exprs.length)) {
                throw new Error(`unexpected syntax: ${tokens[off].src}`);
              }
              if (!expectExpr && exprs.length) composeExpr(priority);
              operators.push({ type, priority });
              /* all operators expect both left and right expressions */
              expectExpr += !expectExpr ? 1 : 2;
              off++;
              break;
            }
          }
          break;
        }

        case TOKEN_TYPE.KEYWORD: {
          throw new Error(`unexpected syntax: ${tokens[off].src}`);
        }

        case TOKEN_TYPE.SEPARATOR: {
          throw new Error(`unexpected syntax: ${tokens[off].src}`);
        }
      }
    }

    if (tokens[off]) {
      off++;
    } else if (!eof) {
      throw new Error("unexpected syntax: EOF");
    }
    composeExpr();
    return exprs[0];
  }

  function parseStatements(term?: (token: Token) => boolean) {
    const statements: Statement[] = [];
    let expr, brk;

    /* while break cases include eof and term(token) === true */
    while (term ? !brk : off < tokens.length) {
      if (term && !tokens[off]) {
        throw new Error("unexpected syntax: EOF");
      }

      /* parse statements except expressions */
      if (keywords.includes(tokens[off].src)) {
        throw new Error(`unexpected syntax: ${tokens[off].src}`);
      }
      expr = parseExpr(
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        (token) =>
          ["\n", ";"].includes(token.src) || !!(brk = term && term(token)),
        !term
      );
      if (expr) statements.push({ type: STATEMENT_TYPE.EXPRESSION, expr });
    }
    return statements;
  }

  return parseStatements();
}

enum SERIALIZE_CONTEXT {
  STATEMENT,
  EXPRESSION,
}

function serializeStatement(
  statement: Statement,
  opts: { minify: boolean; indentLevel: number; indent: number }
) {
  const indent = !opts.minify
    ? new Array(opts.indentLevel * opts.indent).fill(" ").join("")
    : "";
  switch (statement.type) {
    case STATEMENT_TYPE.EXPRESSION:
      return (
        indent +
        serializeExpression(statement.expr, SERIALIZE_CONTEXT.STATEMENT, opts)
      );
    default:
      throw new Error(`unsupported statement: ${statement.type}`);
  }
}

function serializeExpression(
  expr: Expression,
  context: SERIALIZE_CONTEXT,
  opts: { minify: boolean; indentLevel: number; indent: number }
): string {
  const newline = !opts.minify ? "\n" : "";
  const space = !opts.minify ? " " : "";
  const indent = !opts.minify
    ? new Array(opts.indentLevel * opts.indent).fill(" ").join("")
    : "";
  const newlineIndent = !opts.minify
    ? indent + new Array(opts.indent).fill(" ").join("")
    : "";

  switch (expr.type) {
    case EXPRESSION_TYPE.IDENTIFIER: {
      return expr.name;
    }
    case EXPRESSION_TYPE.STRING_LITERAL: {
      const delimiter = expr.value.match("\n") ? "'''" : "'";
      return delimiter + escape(expr.value, delimiter === "'''") + delimiter;
    }
    case EXPRESSION_TYPE.G_STRING: {
      const delimiter = expr.values.some(
        (v) => typeof v === "string" && v.match("\n")
      )
        ? '"""'
        : '"';
      return (
        delimiter +
        expr.values
          .map((v) =>
            typeof v === "string"
              ? escape(v, delimiter === '"""')
              : "${" +
                serializeExpression(v, SERIALIZE_CONTEXT.EXPRESSION, opts) +
                "}"
          )
          .join("") +
        delimiter
      );
    }
    case EXPRESSION_TYPE.NUMBER_LITERAL: {
      throw new Error(`unsupported expression: ${expr.type}`);
    }
    case EXPRESSION_TYPE.BOOLEAN_LITERAL: {
      return expr.value + "";
    }
    case EXPRESSION_TYPE.SET_LITERAL: {
      let src = "[" + newline;
      for (let i = 0, len = expr.exprs.length; i < len; i++) {
        src +=
          newlineIndent +
          serializeExpression(expr.exprs[i], SERIALIZE_CONTEXT.EXPRESSION, {
            ...opts,
            indentLevel: opts.indentLevel + 1,
          }) +
          (i < len - 1 ? "," + newline : "");
      }
      src += newline + indent + "]";
      return src;
    }
    case EXPRESSION_TYPE.MAP_LITERAL: {
      let src = "[" + newline;
      for (let i = 0, len = expr.exprs.length; i < len; i++) {
        const entry = expr.exprs[i];
        src +=
          newlineIndent +
          entry.key +
          ":" +
          space +
          serializeExpression(entry.expr, SERIALIZE_CONTEXT.EXPRESSION, {
            ...opts,
            indentLevel: opts.indentLevel + 1,
          }) +
          (i < len - 1 ? "," + newline : "");
      }
      src += newline + indent + "]";
      return src;
    }
    case EXPRESSION_TYPE.NULL: {
      return "null";
    }
    case EXPRESSION_TYPE.BRACKET: {
      return (
        "(" +
        serializeExpression(expr, SERIALIZE_CONTEXT.EXPRESSION, opts) +
        ")"
      );
    }
    case EXPRESSION_TYPE.CLOSURE: {
      if (expr.error) return expr.src!;

      let src = "{" + newline;
      let indentLevel = opts.indentLevel;

      if (expr.params.length) {
        src += expr.params.join("," + space) + space + "->" + newline;
        indentLevel += 2;
      } else {
        indentLevel += 1;
      }
      for (let i = 0, len = expr.statements.length; i < len; i++) {
        src +=
          serializeStatement(expr.statements[i], { ...opts, indentLevel }) +
          (i < len - 1 ? (opts.minify ? ";" : "\n") : "");
      }
      src += newline + indent + "}";
      return src;
    }
    case EXPRESSION_TYPE.MEMBER_ACCESS: {
      return (
        serializeExpression(expr.left, SERIALIZE_CONTEXT.EXPRESSION, opts) +
        "." +
        (typeof expr.right === "string"
          ? expr.right
          : serializeExpression(expr.right, SERIALIZE_CONTEXT.EXPRESSION, opts))
      );
    }
    case EXPRESSION_TYPE.FUNCTION_CALL: {
      enum PARAMS_COND {
        NO_PARAMS,
        LAST_ONE_IS_CLOSURE,
        MAP,
        DEFAULT,
      }
      let cond = PARAMS_COND.DEFAULT;

      if (!expr.params.length) {
        cond = PARAMS_COND.NO_PARAMS;
      }
      if (
        expr.params.length > 1 &&
        expr.params[expr.params.length - 1].expr.type ===
          EXPRESSION_TYPE.CLOSURE
      ) {
        cond = PARAMS_COND.LAST_ONE_IS_CLOSURE;
      }
      if (
        expr.params.length &&
        expr.params[0].expr.type === EXPRESSION_TYPE.MAP_LITERAL
      ) {
        cond = PARAMS_COND.MAP;
      }

      const nameSrc = serializeExpression(
        expr.name,
        SERIALIZE_CONTEXT.EXPRESSION,
        opts
      );
      const serializeParams = (params: FunctionCallExpression["params"]) => {
        let src = "";
        for (let i = 0; i < params.length; i++) {
          const paramExprSrc = serializeExpression(
            params[i].expr,
            SERIALIZE_CONTEXT.EXPRESSION,
            opts
          );
          src +=
            (params[i].name
              ? params[i].name + ":" + space + paramExprSrc
              : paramExprSrc) + (i < params.length - 1 ? "," + space : "");
        }
        return src;
      };

      switch (cond) {
        case PARAMS_COND.NO_PARAMS: {
          return nameSrc + "()";
        }
        case PARAMS_COND.LAST_ONE_IS_CLOSURE: {
          return (
            nameSrc +
            "(" +
            serializeParams(expr.params.slice(0, -1)) +
            ")" +
            space +
            serializeExpression(
              expr.params[expr.params.length - 1].expr,
              SERIALIZE_CONTEXT.EXPRESSION,
              opts
            )
          );
        }
        case PARAMS_COND.MAP: {
          const map = expr.params[0].expr as MapLiteral;

          if (
            context === SERIALIZE_CONTEXT.EXPRESSION ||
            map.exprs.some(
              (item) =>
                item.expr.type === EXPRESSION_TYPE.MAP_LITERAL ||
                item.expr.type === EXPRESSION_TYPE.SET_LITERAL
            )
          ) {
            return nameSrc + "(" + serializeParams(expr.params) + ")";
          } else {
            const params: any = map.exprs.map((item) => ({
              name: item.key,
              expr: item.expr,
            }));

            params.push(...expr.params.slice(1));
            return nameSrc + " " + serializeParams(params);
          }
        }
        default: {
          if (context === SERIALIZE_CONTEXT.EXPRESSION) {
            return nameSrc + "(" + serializeParams(expr.params) + ")";
          } else {
            return nameSrc + " " + serializeParams(expr.params);
          }
        }
      }
    }
    case EXPRESSION_TYPE.ASSIGNMENT: {
      return (
        serializeExpression(expr.left, SERIALIZE_CONTEXT.EXPRESSION, opts) +
        space +
        "=" +
        space +
        serializeExpression(expr.right, SERIALIZE_CONTEXT.EXPRESSION, opts)
      );
    }
  }
}

export function serialize(
  statements: Statement[],
  opts?: { minify?: boolean; indent?: number }
) {
  return statements
    .map((statement) =>
      serializeStatement(statement, {
        minify: opts?.minify === true,
        indentLevel: 0,
        indent: opts?.indent || 2,
      })
    )
    .join(opts?.minify ? ";" : "\n");
}

export function parse(code: string) {
  return parseSyntax(tokenizer(code), code);
}

export function traverse(
  expr: Expression | Statement,
  iteratee: (expr: Expression, parent?: Expression) => void | (() => void),
  parent?: Expression
) {
  if (expr.type === STATEMENT_TYPE.EXPRESSION) {
    traverse(expr.expr, iteratee, parent);
  } else {
    const onRecurTerm = iteratee(expr, parent);

    switch (expr.type) {
      case EXPRESSION_TYPE.SET_LITERAL: {
        expr.exprs.forEach((ele) => traverse(ele, iteratee, expr));
        if (onRecurTerm) onRecurTerm();
        break;
      }
      case EXPRESSION_TYPE.MAP_LITERAL: {
        expr.exprs.forEach((ele) => traverse(ele.expr, iteratee, expr));
        if (onRecurTerm) onRecurTerm();
        break;
      }
      case EXPRESSION_TYPE.BRACKET: {
        traverse(expr.expr, iteratee, expr);
        if (onRecurTerm) onRecurTerm();
        break;
      }
      case EXPRESSION_TYPE.CLOSURE: {
        expr.statements.forEach(
          (statement) =>
            statement.type === STATEMENT_TYPE.EXPRESSION &&
            traverse(statement.expr, iteratee, expr)
        );
        if (onRecurTerm) onRecurTerm();
        break;
      }
      case EXPRESSION_TYPE.MEMBER_ACCESS: {
        traverse(expr.left, iteratee, expr);
        if (typeof expr.right !== "string")
          traverse(expr.right, iteratee, expr);
        if (onRecurTerm) onRecurTerm();
        break;
      }
      case EXPRESSION_TYPE.FUNCTION_CALL: {
        traverse(expr.name, iteratee, expr);
        expr.params.forEach((param) => traverse(param.expr, iteratee, expr));
        if (onRecurTerm) onRecurTerm();
        break;
      }
      case EXPRESSION_TYPE.ASSIGNMENT: {
        traverse(expr.left, iteratee, expr);
        traverse(expr.right, iteratee, expr);
        if (onRecurTerm) onRecurTerm();
        break;
      }
      default:
        break;
    }
  }
}

export function toJSON(expr: Expression): any {
  const iteratee = (exp: Expression) => {
    if (
      exp.type === EXPRESSION_TYPE.STRING_LITERAL ||
      exp.type === EXPRESSION_TYPE.BOOLEAN_LITERAL ||
      exp.type === EXPRESSION_TYPE.NUMBER_LITERAL
    ) {
      return exp.value;
    }
    if (exp.type === EXPRESSION_TYPE.G_STRING) {
      return exp.values[0];
    }
    if (
      exp.type === EXPRESSION_TYPE.SET_LITERAL ||
      exp.type === EXPRESSION_TYPE.MAP_LITERAL
    ) {
      return toJSON(exp);
    }
    return null;
  };

  if (expr.type === EXPRESSION_TYPE.SET_LITERAL) {
    return expr.exprs.map(iteratee);
  }
  if (expr.type === EXPRESSION_TYPE.MAP_LITERAL) {
    const values = expr.exprs.map((item) => item.expr).map(iteratee);
    return expr.exprs.reduce(
      (ret, item, i) => ((ret[item.key] = values[i]), ret),
      {}
    );
  }
  return iteratee(expr);
}

export function fromJSON(val: any): Expression {
  const iteratee = (value: any) => {
    if (value === null || value === undefined) {
      return { type: EXPRESSION_TYPE.NULL, value };
    }
    if (typeof value === "boolean") {
      return { type: EXPRESSION_TYPE.BOOLEAN_LITERAL, value };
    }
    if (typeof value === "number") {
      return { type: EXPRESSION_TYPE.NUMBER_LITERAL, value };
    }
    if (typeof value === "string") {
      return { type: EXPRESSION_TYPE.G_STRING, values: [value] };
    }
    throw new Error(`unsupported data type: ${typeof value}`);
  };

  if (Array.isArray(val)) {
    return {
      type: EXPRESSION_TYPE.SET_LITERAL,
      exprs: val.map((item) => fromJSON(item)),
    } as SetLiteral;
  }
  if (val !== null && typeof val === "object") {
    return {
      type: EXPRESSION_TYPE.MAP_LITERAL,
      exprs: Object.keys(val)
        .filter((key) => val[key] !== undefined)
        .map((key) => ({ key, expr: fromJSON(val[key]) })),
    } as MapLiteral;
  }
  return iteratee(val) as Expression;
}

function unescape(s: string, allowInterpolate?: boolean) {
  let i = 0;
  let char = s.charAt(i);
  let esc = false;
  let ret = "";

  while (char) {
    switch (char) {
      case "\\":
        if (!esc) char = "";
        esc = !esc;
        break;
      case "b":
        if (esc) char = "\b";
        esc = false;
        break;
      case "f":
        if (esc) char = "\f";
        esc = false;
        break;
      case "n":
        if (esc) char = "\n";
        esc = false;
        break;
      case "r":
        if (esc) char = "\r";
        esc = false;
        break;
      case "s":
        if (esc) char = " ";
        esc = false;
        break;
      case "t":
        if (esc) char = "\t";
        esc = false;
        break;
      case "u":
        if (esc) {
          char = JSON.parse('"\\u' + s.slice(i + 1, i + 5) + '"');
          i += 4;
        }
        esc = false;
        break;
      // we define $ used by interpolation default
      case "$":
        if (esc || !allowInterpolate) char = "\\$";
        esc = false;
        break;
      default:
        esc = false;
        break;
    }
    ret += char;
    i++;
    char = s.charAt(i);
  }

  return ret;
}

function escape(s: string, allowNewline?: boolean) {
  let i = 0;
  let char = s.charAt(i);
  let ret = "";

  while (char) {
    switch (char) {
      case "'":
        char = "\\'";
        break;
      case '"':
        char = '\\"';
        break;
      case "\\":
        if (s.charAt(i + 1) === "$") {
          char = "\\$";
          i++;
        } else {
          char = "\\\\";
        }
        break;
      case "\n":
        if (!allowNewline) char = "\\n";
        break;
      case "\r":
        if (!allowNewline) char = "\\r";
        break;
      case "\v":
        if (!allowNewline) char = "\\v";
        break;
      case "\t":
        if (!allowNewline) char = "\\t";
        break;
      case "\b":
        if (!allowNewline) char = "\\b";
        break;
      case "\f":
        if (!allowNewline) char = "\\f";
        break;
      default:
        char = JSON.stringify(char).slice(1, -1);
        break;
    }
    ret += char;
    i++;
    char = s.charAt(i);
  }

  return ret;
}
