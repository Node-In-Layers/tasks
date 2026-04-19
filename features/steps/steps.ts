import {
  Given,
  When,
  Then,
  setWorldConstructor,
  Before,
  After,
  BeforeAll,
  AfterAll,
} from '@cucumber/cucumber'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DataNamespace } from '@node-in-layers/data'
import * as dataDomain from '@node-in-layers/data/index.js'
import {
  loadSystem,
  CoreNamespace,
  LogFormat,
  LogLevelNames,
  CoreConfig,
} from '@node-in-layers/core'
import { queryBuilder } from 'functional-models'
import { TasksNamespace, TaskStatus, tasksCore } from '../../src/index.js'
import * as backendDomain from '../../src/backend/index.js'
import { ConfigWithTasks, TaskQueueType } from '../../src/backend/types.js'
import { z } from 'zod'
import { assert } from 'chai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const composeCwd = path.resolve(__dirname, '..', '..')
const redisContainerName = 'node-in-layers-tasks-features-redis'
const execFileAsync = promisify(execFile)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const composeArgs = (args: readonly string[]) => [
  'compose',
  '-f',
  'docker-compose-features.yml',
  ...args,
]

const runDockerCompose = (args: readonly string[]) =>
  execFileAsync('docker', composeArgs(args), { cwd: composeCwd }).then(
    () => undefined
  )

const startRedis = () =>
  runDockerCompose(['up', '-d']).then(async () => {
    await sleep(3000)
  })

const stopRedis = () => runDockerCompose(['down'])

const getRedisLogs = (): Promise<string> =>
  execFileAsync(
    'docker',
    composeArgs(['logs', '--no-color', redisContainerName]),
    {
      cwd: composeCwd,
      maxBuffer: 1024 * 1024,
    }
  )
    .then(({ stdout, stderr }) =>
      [stdout, stderr].filter(Boolean).join('\n').trim()
    )
    .catch(() => '')

// Mock queue implementation
class MockQueueService {
  private queue: any[] = []
  private handlers: any[] = []

  reset() {
    this.queue = []
    this.handlers = []
  }

  async enqueueTask(props: any) {
    this.queue.push(props.task)
    this.processQueue()
    return {}
  }

  async dequeueTask(props: any) {
    return {}
  }

  async startTaskPolling(props: any) {
    this.handlers.push(props.handler)
    this.processQueue()
    return {}
  }

  private async processQueue() {
    if (this.handlers.length === 0) return

    while (this.queue.length > 0) {
      const task = this.queue.shift()
      for (const handler of this.handlers) {
        await handler({ taskId: task.id })
      }
    }
  }
}

const mockQueueService = new MockQueueService()

const mockQueueDomain = {
  name: 'mock-queue',
  services: {
    create: () => ({
      enqueueTask: async (props: any, crossLayerProps: any) =>
        mockQueueService.enqueueTask(props),
      dequeueTask: async (props: any, crossLayerProps: any) =>
        mockQueueService.dequeueTask(props),
      startTaskPolling: async (props: any, crossLayerProps: any) =>
        mockQueueService.startTaskPolling(props),
    }),
  },
}

const CONFIGS = {
  tasks: () => {
    const config: CoreConfig & ConfigWithTasks = {
      systemName: 'nil-tasks-features',
      environment: 'test',
      [CoreNamespace.root]: {
        // @ts-ignore
        apps: [
          dataDomain,
          // @ts-ignore
          tasksCore,
          backendDomain,
          mockQueueDomain,
        ],
        layerOrder: ['services', 'features', 'entries'],
        logging: {
          logLevel: LogLevelNames.silent,
          logFormat: [LogFormat.json],
        },
        modelCruds: true,
        modelFactory: '@node-in-layers/data',
        noModelLogWrap: true,
      },
      [DataNamespace.root]: {
        databases: {
          default: {
            datastoreType: 'memory',
          },
        },
      },
      [TasksNamespace.Backend]: {
        queue: {
          enqueueService: 'mock-queue',
        },
        bullMq: {
          type: TaskQueueType.BullMq,
          redis: {
            host: '127.0.0.1',
            port: 6379,
          },
        },
        callbacks: {
          callbackFailedLogLevel: LogLevelNames.warn,
        },
      },
    }
    return config
  },
  tasksBullMq: () => {
    const config: CoreConfig & ConfigWithTasks = {
      systemName: 'nil-tasks-features-bullmq',
      environment: 'test',
      [CoreNamespace.root]: {
        // @ts-ignore
        apps: [dataDomain, tasksCore, backendDomain],
        layerOrder: ['services', 'features', 'entries'],
        logging: {
          logLevel: LogLevelNames.silent,
          logFormat: [LogFormat.json],
        },
        modelCruds: true,
        modelFactory: '@node-in-layers/data',
        noModelLogWrap: true,
      },
      [DataNamespace.root]: {
        databases: {
          default: {
            datastoreType: 'memory',
          },
        },
      },
      [TasksNamespace.Backend]: {
        queue: {},
        bullMq: {
          type: TaskQueueType.BullMq,
          redis: {
            host: '127.0.0.1',
            port: 6380,
          },
        },
        callbacks: {
          callbackFailedLogLevel: LogLevelNames.warn,
        },
      },
    }
    return config
  },
} as const

class TestWorld {
  system: any | undefined
  configKey: keyof typeof CONFIGS | undefined
  tasksFeatures: any
  pollerAbortController: AbortController | undefined
  featureFunc: any
  sourceDomain: string | undefined
  sourceFeature: string | undefined
  sourceFunc: any
  targetDomain: string | undefined
  targetFeature: string | undefined
  callbackExecuted: () => boolean = () => false
  targetExecuted: () => boolean = () => false
  lastResult: any
  lastTask: any
  lastChildTask: any
}

setWorldConstructor(TestWorld)

BeforeAll({ timeout: 30_000 }, async function () {
  await stopRedis().catch(() => undefined)
  await startRedis()
})

AfterAll(async function () {
  await stopRedis().catch(() => undefined)
})

Before(function () {
  mockQueueService.reset()
  this.pollerAbortController = undefined
})

After(async function () {
  if (this.pollerAbortController) {
    this.pollerAbortController.abort()
    this.pollerAbortController = undefined
  }
})

Given('I use the {string} config', function (key: string) {
  if (!(key in CONFIGS)) {
    throw new Error(
      `Unknown config key "${key}". Known keys: ${Object.keys(CONFIGS).join(', ')}`
    )
  }
  this.configKey = key as keyof typeof CONFIGS
})

Given('I load the system', async function () {
  const key = this.configKey ?? ('tasks' as keyof typeof CONFIGS)
  const createConfig = CONFIGS[key]

  const config = createConfig()
  // @ts-ignore - test-only config; structural typing is enough here
  this.system = await loadSystem({
    environment: 'cucumber-test',
    config,
  })

  this.tasksFeatures = this.system.features[TasksNamespace.Backend]
})

Given(
  'a task feature is created in the domain {string} with feature {string}',
  async function (domain: string, feature: string) {
    this.featureFunc = this.tasksFeatures.createTaskFeature(
      {
        functionName: feature,
        domain: domain,
        args: z.object({ value: z.string() }),
        returns: z.object({ success: z.boolean(), echo: z.string() }),
      },
      async (props: any) => {
        return { success: true, echo: props.value }
      }
    )
  }
)

When(
  'the task feature is called with executeNow set to true',
  async function () {
    this.lastResult = await this.featureFunc({
      value: 'test-value',
      '_@node-in-layers/tasks': { executeNow: true },
    })
  }
)

Then('the task should execute synchronously', async function () {
  assert.isOk(this.lastResult)
  assert.isOk(this.lastResult.taskId)
})

Then(
  'the task status should be marked as {string}',
  async function (status: string) {
    const task = await this.system.services[
      TasksNamespace.Core
    ].cruds.Tasks.retrieve(this.lastResult.taskId).then((x: any) => x?.toObj())
    assert.isOk(task)
    assert.equal(task.status, status)
    this.lastTask = task
  }
)

Then('the task result should contain the expected output', async function () {
  assert.isOk(this.lastTask.result)
  assert.equal(this.lastTask.result.success, true)
})

When('the task feature is called without executeNow', async function () {
  this.lastResult = await this.featureFunc({
    value: 'queued-value',
  })
  this.lastTask = await this.system.services[
    TasksNamespace.Core
  ].cruds.Tasks.retrieve(this.lastResult.taskId).then((x: any) => x?.toObj())
})

Then('the task should be added to the queue', async function () {
  assert.isOk(this.lastResult.taskId)
})

When('the task poller processes the queue', async function () {
  this.pollerAbortController = new AbortController()
  await this.tasksFeatures.startTaskPolling({
    abortSignal: this.pollerAbortController.signal,
  })
  // Wait for poller to process
  const result = await this.tasksFeatures.awaitTask({
    taskId: this.lastResult.taskId,
    timeoutMs: 5000,
    pollIntervalMs: 100,
  })
  assert.isNotOk(result.error)
})

Then('the task should execute successfully', async function () {
  const task = await this.system.services[
    TasksNamespace.Core
  ].cruds.Tasks.retrieve(this.lastResult.taskId).then((x: any) => x?.toObj())
  assert.isOk(task)
  assert.equal(task.status, TaskStatus.Completed)
  this.lastTask = task
})

Given(
  'a source task feature is created in the domain {string} with feature {string}',
  async function (domain: string, feature: string) {
    this.sourceDomain = domain
    this.sourceFeature = feature
    this.sourceFunc = this.tasksFeatures.createTaskFeature(
      {
        functionName: feature,
        domain: domain,
        args: z.object({ value: z.string() }),
        returns: z.object({ success: z.boolean(), echo: z.string() }),
      },
      async (props: any) => {
        return { success: true, echo: props.value }
      }
    )
  }
)

Given(
  'a target callback feature is registered for the source domain {string} and feature {string}',
  async function (domain: string, feature: string) {
    this.targetDomain = 'test'
    this.targetFeature = 'target-code-task'

    this.callbackExecutedFlag = false
    this.callbackExecuted = () => this.callbackExecutedFlag

    this.tasksFeatures.registerTaskCallback({
      sourceDomain: domain,
      sourceFeature: feature,
      targetDomain: this.targetDomain,
      targetFeature: this.targetFeature,
      conditions: { onSuccess: true },
      method: async (props: any) => {
        this.callbackExecutedFlag = true
      },
    })
  }
)

When(
  'the source task feature is called with executeNow set to true',
  async function () {
    this.lastResult = await this.sourceFunc({
      value: 'source-value',
      '_@node-in-layers/tasks': { executeNow: true },
    })
  }
)

Then('the source task should execute successfully', async function () {
  assert.isOk(this.lastResult.taskId)
  const task = await this.system.services[
    TasksNamespace.Core
  ].cruds.Tasks.retrieve(this.lastResult.taskId).then((x: any) => x?.toObj())
  assert.equal(task.status, TaskStatus.Completed)
  this.lastTask = task
})

Then(
  'a child task for the target callback should be spawned',
  async function () {
    const children = await this.system.services[
      TasksNamespace.Core
    ].cruds.Tasks.search(
      queryBuilder().property('parentTaskId', this.lastTask.id).compile()
    ).then((res: any) => Promise.all(res.instances.map((x: any) => x.toObj())))

    assert.equal(children.length, 1)
    this.lastChildTask = children[0]
  }
)

Then(
  'the child task should have the source task ID as its parentTaskId',
  async function () {
    assert.equal(this.lastChildTask.parentTaskId, this.lastTask.id)
  }
)

When('the child task is processed', async function () {
  this.pollerAbortController = new AbortController()
  await this.tasksFeatures.startTaskPolling({
    abortSignal: this.pollerAbortController.signal,
  })
  const result = await this.tasksFeatures.awaitTask({
    taskId: this.lastChildTask.id,
    timeoutMs: 5000,
    pollIntervalMs: 100,
  })
  assert.isNotOk(result.error)
})

Then('the child task should execute successfully', async function () {
  if (this.targetExecutedFlag !== undefined) {
    assert.isTrue(this.targetExecuted())
  } else if (this.callbackExecutedFlag !== undefined) {
    assert.isTrue(this.callbackExecuted())
  } else {
    assert.fail('No callback execution verification found')
  }
})

Then(
  'the child task status should be marked as {string}',
  async function (status: string) {
    const task = await this.system.services[
      TasksNamespace.Core
    ].cruds.Tasks.retrieve(this.lastChildTask.id).then((x: any) => x?.toObj())
    assert.equal(task.status, status)
  }
)

Given(
  'a target task feature is created in the domain {string} with feature {string}',
  async function (domain: string, feature: string) {
    this.targetDomain = domain
    this.targetFeature = feature

    this.targetExecutedFlag = false
    this.targetExecuted = () => this.targetExecutedFlag

    this.tasksFeatures.createTaskFeature(
      {
        functionName: feature,
        domain: domain,
        args: z.any(), // Accepts the source task payload
      },
      async (props: any) => {
        this.targetExecutedFlag = true
        return {}
      }
    )
  }
)

Given(
  'a task callback mapping is saved in the database mapping the source to the target',
  async function () {
    await this.system.services[
      TasksNamespace.Core
    ].cruds.TaskCallbackMappings.create({
      sourceDomain: this.sourceDomain,
      sourceFeature: this.sourceFeature,
      targetDomain: this.targetDomain,
      targetFeature: this.targetFeature,
      conditions: { onSuccess: true },
    })
  }
)

Then(
  'a child task for the target feature should be spawned from the database mapping',
  async function () {
    const children = await this.system.services[
      TasksNamespace.Core
    ].cruds.Tasks.search(
      queryBuilder().property('parentTaskId', this.lastTask.id).compile()
    ).then((res: any) => Promise.all(res.instances.map((x: any) => x.toObj())))

    assert.equal(children.length, 1)
    this.lastChildTask = children[0]
    assert.equal(this.lastChildTask.domain, this.targetDomain)
    assert.equal(this.lastChildTask.feature, this.targetFeature)
  }
)
