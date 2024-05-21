
import { findTargets } from "./findTarget.ts";
import ts from "npm:typescript";

export * as util from "./util.ts";

type SourceGeneratorTargetMap = {
    [ts.SyntaxKind.ClassDeclaration]: ts.ClassDeclaration;
    [ts.SyntaxKind.MethodDeclaration]: ts.MethodDeclaration;
    [ts.SyntaxKind.PropertyDeclaration]: ts.PropertyDeclaration;
};

export type SourceGeneratorTargetType = keyof SourceGeneratorTargetMap;
export type SourceGeneratorTarget = SourceGeneratorTargetMap[SourceGeneratorTargetType];

export type SourceGenerator<T extends SourceGeneratorTargetType = SourceGeneratorTargetType> = {
    readonly targetType?: T[];
    readonly targetAttribute: string | RegExp,
    generate(context: GenerationContext<T>): string | Promise<string>;
};

export class GenerationContext<T extends SourceGeneratorTargetType = SourceGeneratorTargetType> {
    #attr: ts.NodeArray<ts.Expression> | null;
    #target: SourceGeneratorTargetMap[T];
    #attrTextCache: string | undefined;
    #targetTextCache: string | undefined;
    #file: ts.SourceFile;
    readonly printer: ts.Printer;
    constructor(file: ts.SourceFile, attr: null | ts.NodeArray<ts.Expression>, target: SourceGeneratorTargetMap[T]) {
        this.#file = file;
        this.#attr = attr;
        this.#target = target;
        this.printer = ts.createPrinter();
    }

    get sourceFile() {
        return this.#file;
    }

    get attribute(): null | ts.NodeArray<ts.Expression> {
        return this.#attr;
    }

    get target(): SourceGeneratorTargetMap[T] {
        return this.#target;
    }

    getAttributeText(): null | string {
        if (this.#attr === null) {
            return null;
        }
        if (this.#attrTextCache === undefined) {
            this.#attrTextCache = this.#attr.map(t => t.getText(this.#file)).join(",");
        }
        return this.#attrTextCache;
    }

    getTargetText(): string {
        this.#targetTextCache ??= this.#target.getText(this.#file);
        return this.#targetTextCache;
    }
}

export async function transform(sourceFile: ts.SourceFile, generators: SourceGenerator[]): Promise<ts.SourceFile> {
    while (true) {
        const targets = findTargets(sourceFile, generators);
        const { done, value } = targets.next();
        if (done) {
            return sourceFile;
        }
        const context = new GenerationContext(sourceFile, value.attr, value.target);
        const pos = value.target.pos;
        const end = value.target.end;
        // deno-lint-ignore no-explicit-any
        const generated = await value.generator.generate(context as any);
        const newText = sourceFile.text.substring(0, pos) + generated + sourceFile.text.substring(end);
        sourceFile = sourceFile.update(newText, {
            newLength: newText.length,
            span: { start: pos, length: sourceFile.text.length }
        });
    }
}