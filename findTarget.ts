import ts, { ModifierLike, NodeArray, CallExpression } from "npm:typescript";
import { SourceGenerator, SourceGeneratorTarget } from "./mod.ts";

export function* findTargets(file: ts.SourceFile, generators: SourceGenerator[]) {
    const distribute = createNodeDistributer(createDistributer(generators));
    for (const info of findTargetsInNode(file, file, distribute)) {
        yield { attr: info.attr, target: info.target, generator: generators[info.generatorIndex] };
    }
}

type Distributer = (name: string, ty: ts.SyntaxKind) => number | undefined;
type NodeDistributer = (file: ts.SourceFile, node: ts.Node & { modifiers?: NodeArray<ModifierLike>; }) => NodeDistributionInfo | undefined;
type NodeDistributionInfo = {
    generatorIndex: number;
    attr: null | ts.NodeArray<ts.Expression>;
    target: SourceGeneratorTarget;
};

function createDistributer(generators: SourceGenerator[]): Distributer {
    return (name: string, ty: ts.SyntaxKind) => {
        let idx = 0;
        for (const gen of generators) {
            if (gen.targetType) {
                if (!((gen.targetType as ts.SyntaxKind[]).includes(ty))) {
                    continue;
                }
            }
            if (typeof gen.targetAttribute === "string") {
                if (name === gen.targetAttribute) {
                    return idx;
                }
            } else {
                const matches = name.match(gen.targetAttribute);
                if (matches !== null && matches[0] === name) { // check regex matched entire identifier 
                    return idx;
                }
            }

            idx += 1;
        }
    };
}

function createNodeDistributer(distribute: Distributer): NodeDistributer {
    return (file: ts.SourceFile, node: ts.Node & { modifiers?: NodeArray<ModifierLike>; }) => {
        for (const mod of node.modifiers ?? []) {
            if (mod.kind !== ts.SyntaxKind.Decorator) continue;
            let identifier: string;
            let args: null | ts.NodeArray<ts.Expression>;
            switch (mod.expression.kind) {
                case ts.SyntaxKind.Identifier:
                    identifier = mod.expression.getText(file);
                    args = null;
                    break;
                case ts.SyntaxKind.CallExpression: {
                    const call = mod.expression as CallExpression;
                    const callee = call.expression;
                    identifier = callee.getText(file);
                    args = call.arguments;
                    break;
                }
                default: continue;
            }
            const id = distribute(identifier, node.kind);
            if (id !== undefined) {
                return {
                    generatorIndex: id, target: node as SourceGeneratorTarget, attr: args
                };
            }
        }
    };
}

function* findTargetsInNode(file: ts.SourceFile, node: ts.Node, distributer: NodeDistributer): IterableIterator<NodeDistributionInfo> {
    if (node.kind === ts.SyntaxKind.ClassDeclaration) {
        const classNode = node as ts.ClassDeclaration;
        let result = distributer(file, classNode);
        if (result !== undefined) {
            yield result;
            return;
        }

        for (const member of classNode.members) {
            result = distributer(file, member);
            if (result !== undefined) {
                yield result;
                return;
            }
            yield* findTargetsInNode(file, member, distributer);
        }
        return;
    }

    for (const classNode of findClass(file, node)) {
        yield* findTargetsInNode(file, classNode, distributer);
    }
}

function* findClass(file: ts.SourceFile, node: ts.Node): IterableIterator<ts.ClassDeclaration> {
    for (const c of node.getChildren(file)) {
        switch (c.kind) {
            case ts.SyntaxKind.ClassDeclaration:
                yield c as ts.ClassDeclaration;
                break;
            default:
                yield* findClass(file, c);
                break;
        }
    }
}