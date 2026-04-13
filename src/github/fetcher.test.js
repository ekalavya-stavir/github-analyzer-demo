import { test, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFileAtCommit } from './fetcher.js';

describe('GitHub Fetcher - AST Strategy', () => {

    describe('fetchFileAtCommit', () => {
        it('should fetch the raw file content for a specific commit SHA', async () => {
            // Arrange
            const mockContent = 'function hello() { return "world"; }';
            const base64Content = Buffer.from(mockContent).toString('base64');

            const mockRequest = async (url, req) => {
                assert.equal(req.owner, 'owner');
                assert.equal(req.repo, 'repo');
                assert.equal(req.path, 'src/index.js');
                assert.equal(req.ref, 'abc123sha');

                return {
                    data: {
                        content: base64Content,
                        encoding: 'base64'
                    }
                };
            };

            // Act
            const result = await fetchFileAtCommit('owner', 'repo', 'src/index.js', 'abc123sha', mockRequest);

            // Assert
            assert.equal(result, mockContent);
        });

        it('should throw an error if the file cannot be found at that commit', async () => {
            // Arrange
            const mockRequest = async () => {
                const notFoundError = new Error('Not Found');
                notFoundError.status = 404;
                throw notFoundError;
            };

            // Act & Assert
            await assert.rejects(
                fetchFileAtCommit('owner', 'repo', 'deleted/file.js', 'abc123sha', mockRequest),
                { message: 'File deleted/file.js not found at commit abc123sha' }
            );
        });
    });
});
