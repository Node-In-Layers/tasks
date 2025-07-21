# Distributed Tasks - The Node In Layers Package for Creating / Running Asynchronous Tasks
![Unit Tests](https://github.com/node-in-layers/tasks/actions/workflows/ut.yml/badge.svg?branch=main)
[![Coverage Status](https://coveralls.io/repos/github/Node-In-Layers/tasks/badge.svg?branch=try-again)](https://coveralls.io/github/Node-In-Layers/tasks?branch=try-again)
This repository provides a standardized interface, models, and functional code for running distributed tasks within the Node in Layers framework. It handles complex workflows with hierarchical task spawning, future scheduling, and event-driven callbacks. 

Tasks are executed at the "feature" level.

## Implementations
While the system can be customized to have any implementation, the out of the box implementation uses BullMQ and Docker.

