/**
 * @flow
 * @jest-environment node
 */

import { join } from 'path';
import { readFile, remove } from 'fs-extra';
import request from 'request-promise-native';
import {
  defaultFileMatch as mockFileMatch,
  defaultFileMatchIgnore as mockFileMatchIgnore,
  defaultExclude as mockExclude
} from 'react-cosmos-shared/server';
import io from 'socket.io-client';
import { startServer } from '../start';

const mockRootPath = join(__dirname, '__fsmocks__');
const mockProxiesPath = join(mockRootPath, 'cosmos.proxies');
const mockModulesPath = join(__dirname, '__fsoutput__/cosmos.modules.js');

jest.mock('react-cosmos-config', () => ({
  getCosmosConfig: () => ({
    rootPath: mockRootPath,
    port: 10001,
    hostname: null,
    publicUrl: '/',
    fileMatch: mockFileMatch,
    fileMatchIgnore: mockFileMatchIgnore,
    exclude: mockExclude,
    proxiesPath: mockProxiesPath,
    modulesPath: mockModulesPath
  })
}));

let stopServer;

beforeEach(async () => {
  jest.clearAllMocks();
  stopServer = await startServer();
});

afterEach(async () => {
  await stopServer();
  await remove(mockModulesPath);
});

it('serves index.html on / route with playgrounds opts included', async () => {
  const res = await request('http://127.0.0.1:10001/');
  const source = await readFile(
    require.resolve('../../shared/static/index.html'),
    'utf8'
  );

  const playgroundOpts = {
    platform: 'native',
    projectKey: mockRootPath
  };
  expect(res).toEqual(
    source.replace('__PLAYGROUND_OPTS__', JSON.stringify(playgroundOpts))
  );
});

it('serves playground js on /_playground.js route', async () => {
  const res = await request('http://127.0.0.1:10001/_playground.js');
  const source = await readFile(
    require.resolve('react-cosmos-playground'),
    'utf8'
  );

  expect(res).toEqual(source);
});

it('serves favicon.ico on /_cosmos.ico route', async () => {
  const res = await request('http://127.0.0.1:10001/_cosmos.ico');
  const source = await readFile(
    require.resolve('../../shared/static/favicon.ico'),
    'utf8'
  );

  expect(res).toEqual(source);
});

it('broadcasts events to between clients', async () => {
  const socket1 = io('http://localhost:10001');
  const socket2 = io('http://localhost:10001');

  await untilConnected(socket1);
  await untilConnected(socket2);

  await new Promise(resolve => {
    socket2.on('cosmos-cmd', msg => {
      resolve();
      expect(msg).toEqual({ type: 'MY_CMD' });
    });
    socket1.emit('cosmos-cmd', { type: 'MY_CMD' });
  });
});

it('generates modules file', async () => {
  const output = await readFile(mockModulesPath, 'utf8');

  const fixturePath = join(mockRootPath, 'MyComponent.fixture.js');
  const componentPath = join(mockRootPath, 'MyComponent.js');
  const fixtureFile = {
    filePath: fixturePath,
    components: [{ name: 'MyComponent', filePath: componentPath }]
  };
  expect(output)
    .toBe(`// This file is automatically generated by Cosmos. Best ignore it.
export const options = {
  port: 10001
};

export function getUserModules() {
  return {
    fixtureModules: {'${fixturePath}':require('${fixturePath}')},
    fixtureFiles: [${JSON.stringify(fixtureFile)}],
    proxies: require('${mockProxiesPath}')
  }
};\n`);
});

function untilConnected(socket) {
  return new Promise(resolve => {
    socket.on('connect', resolve);
  });
}
