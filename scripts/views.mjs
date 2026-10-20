// The views an app copies into its own code,
// made ready to copy: dist/views/<component>/ holds each file of the component as views.json lists it, and the tests
// that come with it, each import of the package's own files written as an import of the public entry that exports the
// very same thing (`@wordplus/realtime-ui`, `/calls`, `/react`, `/testing`), or of the copy beside it when the file it
// imports is copied too. The checker resolves each name to its declaration, so a type comes from wherever an entry
// exports it, and a name no entry exports stops the build. Then the copies are type-checked as an app has them, on the
// package's declarations (dist/types), so a copy that wouldn't compile never ships.
//
// dist/views/manifest.json lists the components, their files and tests, and how a page uses them; the CLI
// (bin/realtime-ui.mjs) reads it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const pkg = JSON.parse( readFileSync( join( root, 'package.json' ), 'utf8' ) );
const views = JSON.parse( readFileSync( join( root, 'views.json' ), 'utf8' ) );
const out = join( root, 'dist', 'views' );

const ENTRIES = [
    [ 'src/index.ts', pkg.name ],
    [ 'src/calls.ts', pkg.name + '/calls' ],
    [ 'src/react.tsx', pkg.name + '/react' ],
    [ 'src/testing.ts', pkg.name + '/testing' ],
];

const config = ts.getParsedCommandLineOfConfigFile( join( root, 'tsconfig.json' ), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: ( d ) => { throw new Error( ts.flattenDiagnosticMessageText( d.messageText, '\n' ) ); } } );
const copied = Object.values( views ).flatMap( ( v ) => [ ...Object.values( v.files ), ...Object.values( v.tests ?? {} ) ] ).map( ( f ) => join( root, f ) );
const program = ts.createProgram( { rootNames: [ ...ENTRIES.map( ( [ f ] ) => join( root, f ) ), ...copied ], options: { ...config.options, noEmit: true } } );
const checker = program.getTypeChecker();

/** A declaration's place, which every name for it shares. */
function declarationOf( symbol ) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol( symbol ) : symbol;
    const declaration = target.declarations?.[ 0 ];
    return declaration ? declaration.getSourceFile().fileName + ':' + declaration.pos : null;
}

// Each declaration the entries export, with the first entry that does and its name there.
const exported = new Map();
for ( const [ file, specifier ] of ENTRIES ) {
    const source = program.getSourceFile( join( root, file ) );
    for ( const symbol of checker.getExportsOfModule( checker.getSymbolAtLocation( source ) ) ) {
        const key = declarationOf( symbol );
        if ( key && ! exported.has( key ) ) exported.set( key, { specifier, name: symbol.name } );
    }
}

const HEADER = ( component, from ) => `// ${ component }: copied from ${ pkg.name } (${ from }) by \`npx ${ pkg.name } add ${ component }\`. It is yours now:\n`
    + `// change anything. \`npx ${ pkg.name } diff ${ component }\` shows what changed in ours since, to merge into yours.\n`;

/** A file as a copy has it: its imports of the package's own files rewritten, a header on top. */
function copyOf( component, file, inCopy, isTest ) {
    const abs = join( root, file );
    const source = program.getSourceFile( abs );
    const edits = [];
    const problems = [];
    const fromPackage = new Map();
    let firstAt = null;

    for ( const statement of source.statements ) {
        // `export { … } from './…'`: each name from the entry that exports it, as an import of it is.
        if ( ts.isExportDeclaration( statement ) && statement.moduleSpecifier && ts.isStringLiteral( statement.moduleSpecifier ) && statement.moduleSpecifier.text.startsWith( '.' ) ) {
            const spec = statement.moduleSpecifier.text;
            const resolved = ts.resolveModuleName( spec, abs, config.options, ts.sys ).resolvedModule?.resolvedFileName;
            if ( resolved && inCopy.has( resolved ) ) {
                edits.push( [ statement.moduleSpecifier.getStart( source ), statement.moduleSpecifier.end, `'./${ inCopy.get( resolved ).replace( /\.tsx?$/, '' ) }'` ] );
                continue;
            }
            if ( ! statement.exportClause || ! ts.isNamedExports( statement.exportClause ) ) {
                problems.push( `${ file }: \`export *\` from ${ spec }` );
                continue;
            }
            const byEntry = new Map();
            for ( const element of statement.exportClause.elements ) {
                const found = exported.get( declarationOf( checker.getExportSpecifierLocalTargetSymbol( element ) ?? checker.getSymbolAtLocation( element.name ) ) );
                const as = element.name.text;
                if ( ! found ) {
                    problems.push( `${ file }: ${ as } from ${ spec } is exported by no entry` );
                    continue;
                }
                const names = byEntry.get( found.specifier ) ?? [];
                names.push( ( statement.isTypeOnly || element.isTypeOnly ? 'type ' : '' ) + ( found.name === as ? as : `${ found.name } as ${ as }` ) );
                byEntry.set( found.specifier, names );
            }
            edits.push( [ statement.getStart( source ), statement.end, [ ...byEntry ].map( ( [ specifier, names ] ) => `export { ${ names.join( ', ' ) } } from '${ specifier }';` ).join( '\n' ) ] );
            continue;
        }

        if ( ! ts.isImportDeclaration( statement ) || ! ts.isStringLiteral( statement.moduleSpecifier ) ) continue;
        const spec = statement.moduleSpecifier.text;
        // Only React (and a test's tools) beside the package: the app has those, and none of the package's own
        // dependencies, which a strict installer (pnpm) keeps out of its reach.
        if ( ! spec.startsWith( '.' ) ) {
            if ( ! /^(react|react-dom(\/client)?|react\/jsx-runtime)$/.test( spec ) && ! ( isTest && /^(vitest|@testing-library\/react)$/.test( spec ) ) ) {
                problems.push( `${ file }: imports ${ spec } itself: take it through one of the package's entries` );
            }
            continue;
        }

        const resolved = ts.resolveModuleName( spec, abs, config.options, ts.sys ).resolvedModule?.resolvedFileName;
        if ( resolved && inCopy.has( resolved ) ) {
            edits.push( [ statement.moduleSpecifier.getStart( source ), statement.moduleSpecifier.end, `'./${ inCopy.get( resolved ).replace( /\.tsx?$/, '' ) }'` ] );
            continue;
        }

        const clause = statement.importClause;
        if ( ! clause ) {
            problems.push( `${ file }: imports ${ spec } for its effect, which a copy can't` );
            continue;
        }
        const byEntry = new Map();
        const take = ( node, local, typeOnly ) => {
            const found = exported.get( declarationOf( checker.getSymbolAtLocation( node ) ) );
            if ( ! found ) {
                problems.push( `${ file }: ${ local } from ${ spec } is exported by no entry` );
                return;
            }
            const names = byEntry.get( found.specifier ) ?? [];
            names.push( ( typeOnly ? 'type ' : '' ) + ( found.name === local ? local : `${ found.name } as ${ local }` ) );
            byEntry.set( found.specifier, names );
        };
        if ( clause.name ) take( clause.name, clause.name.text, clause.isTypeOnly );
        if ( clause.namedBindings ) {
            if ( ts.isNamespaceImport( clause.namedBindings ) ) problems.push( `${ file }: \`import * as\` from ${ spec }` );
            else for ( const element of clause.namedBindings.elements ) take( element.name, element.name.text, clause.isTypeOnly || element.isTypeOnly );
        }
        // Gathered with the file's other imports of the package, one line an entry where the first of them was.
        for ( const [ specifier, names ] of byEntry ) {
            const all = fromPackage.get( specifier ) ?? [];
            for ( const name of names ) if ( ! all.includes( name ) ) all.push( name );
            fromPackage.set( specifier, all );
        }
        const end = source.getFullText()[ statement.end ] === '\n' ? statement.end + 1 : statement.end;
        if ( firstAt === null ) firstAt = statement.getStart( source );
        edits.push( [ statement.getStart( source ), end, '' ] );
    }

    if ( problems.length ) throw new Error( 'The views can not be copied:\n' + problems.join( '\n' ) );
    if ( firstAt !== null ) {
        const order = ENTRIES.map( ( [ , specifier ] ) => specifier );
        const lines = [ ...fromPackage ].sort( ( a, b ) => order.indexOf( a[ 0 ] ) - order.indexOf( b[ 0 ] ) )
            .map( ( [ specifier, names ] ) => `import { ${ names.join( ', ' ) } } from '${ specifier }';\n` );
        edits.push( [ firstAt, firstAt, lines.join( '' ) ] );
    }

    let text = source.getFullText();
    for ( const [ start, end, replacement ] of edits.sort( ( a, b ) => b[ 0 ] - a[ 0 ] ) ) text = text.slice( 0, start ) + replacement + text.slice( end );
    // A client component for a framework that renders on the server (Next.js): what a view draws needs the browser.
    return ( isTest ? '' : '"use client";\n' ) + HEADER( component, file.replace( /^src\//, '' ) ) + text;
}

rmSync( out, { recursive: true, force: true } );
const manifest = { package: pkg.name, version: pkg.version, components: {} };

for ( const [ component, view ] of Object.entries( views ) ) {
    const dir = join( out, component );
    mkdirSync( dir, { recursive: true } );
    const inCopy = new Map( Object.entries( { ...view.files, ...view.tests } ).map( ( [ name, file ] ) => [ join( root, file ), name ] ) );

    for ( const [ name, file ] of Object.entries( view.files ) ) writeFileSync( join( dir, name ), copyOf( component, file, inCopy, false ) );
    for ( const [ name, file ] of Object.entries( view.tests ?? {} ) ) writeFileSync( join( dir, name ), copyOf( component, file, inCopy, true ) );
    writeFileSync( join( dir, 'index.ts' ), `// ${ component }'s views, for the page that uses them (${ pkg.name }'s views.json).\n` + view.index );

    manifest.components[ component ] = {
        about: view.about,
        files: [ ...Object.keys( view.files ), 'index.ts' ],
        tests: Object.keys( view.tests ?? {} ),
        react: view.react,
        elements: view.elements,
    };
}
writeFileSync( join( out, 'manifest.json' ), JSON.stringify( manifest, null, 2 ) + '\n' );

// The copies as an app compiles them: on the package's declarations, nothing of its source.
const check = join( out, '.tsconfig.check.json' );
const types = ( entry ) => [ relative( out, join( root, 'dist/types', entry ) ) ];
writeFileSync( check, JSON.stringify( {
    compilerOptions: {
        strict: true, noEmit: true, jsx: 'react-jsx', module: 'esnext', target: 'es2021', moduleResolution: 'bundler',
        esModuleInterop: true, skipLibCheck: true, isolatedModules: true, lib: [ 'dom', 'dom.iterable', 'es2021' ],
        // React, vitest and the testing library from the package's own node_modules, above dist/views.
        baseUrl: '.',
        paths: {
            [ pkg.name ]: types( 'index.d.ts' ),
            [ pkg.name + '/calls' ]: types( 'calls.d.ts' ),
            [ pkg.name + '/react' ]: types( 'react.d.ts' ),
            [ pkg.name + '/testing' ]: types( 'testing.d.ts' ),
        },
    },
    include: [ '**/*.ts', '**/*.tsx' ],
}, null, 2 ) );
try {
    execFileSync( join( root, 'node_modules/.bin/tsc' ), [ '-p', check ], { stdio: 'inherit' } );
} finally {
    rmSync( check, { force: true } );
}

console.log( 'built dist/views: ' + Object.keys( views ).map( ( c ) => `${ c } (${ Object.keys( views[ c ].files ).length } files)` ).join( ', ' ) );
