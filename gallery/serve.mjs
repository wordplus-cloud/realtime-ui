// Serves gallery/build for the picture checks (playwright.config.ts starts it): http://127.0.0.1:4870/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join( dirname( fileURLToPath( import.meta.url ) ), 'build' );
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

createServer( async ( req, res ) => {
    const path = normalize( decodeURIComponent( new URL( req.url ?? '/', 'http://x' ).pathname ) ).replace( /^(\.\.[/\\])+/, '' );
    const file = join( root, path === '/' ? 'index.html' : path );
    try {
        const body = await readFile( file );
        res.writeHead( 200, { 'Content-Type': TYPES[ extname( file ) ] ?? 'application/octet-stream' } );
        res.end( body );
    } catch {
        res.writeHead( 404 );
        res.end();
    }
} ).listen( Number( process.env.PORT ?? 4870 ), '127.0.0.1' );
