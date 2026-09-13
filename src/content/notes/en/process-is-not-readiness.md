---
noteId: "process-is-not-readiness"
locale: "en"
title: "The process is running. Is the application ready?"
summary: "Reading Docker Compose startup conditions through a question raised by HealthOS configuration."
seoDescription: "Source analysis of service_started, service_healthy and health-check boundaries in Docker Compose, with a HealthOS configuration example."
---

*A source-analysis note edited by the Codex assistant on 10 September 2026. This is not an account of an incident Nam experienced or evidence that Nam personally ran an experiment.*

## A question from configuration

In [HealthOS Compose at commit 5131987](https://github.com/siinn1706/NT208_HealthOS/blob/5131987c953d800e1c343cc7156be7554e4e498f/infra/docker/docker-compose.prod.yml#L46-L118), the Core waits for a successful migration. The frontend instead waits for the Core's health check. These conditions raise a small question: does a process appearing in a running list mean another component can already send it requests?

A service may need initialization time after its process starts. Docker documentation distinguishes startup ordering from waiting for a dependency to pass its health check. [Docker startup-order guide](https://docs.docker.com/compose/how-tos/startup-order/).

## Three conditions, three questions

| Condition | Startup question |
|---|---|
| `service_started` | Has the dependency started? |
| `service_healthy` | Has its declared health check passed? |
| `service_completed_successfully` | Has the dependency task finished successfully? |

The short form of `depends_on` waits for startup. Its long form allows a suitable condition, such as a passing health check or a completed one-off task. The completion condition helps explain migration configuration; it is not a continuously running health check. [`depends_on` reference](https://docs.docker.com/reference/compose-file/services/#depends_on).

## What does the health check test?

Health is an additional container status. A probe can succeed while the process is alive, then fail on a later check. Retry counts, timeouts and initialization periods affect when the status changes. [`HEALTHCHECK` reference](https://docs.docker.com/reference/dockerfile/#healthcheck).

The next thing to read is the check itself. HealthOS probes `/health/ready` on the Core; the endpoint's name suggests its purpose, but its logic defines the scope. Configuration analysis alone cannot establish functioning sign-in, health data or AI.

An endpoint check should answer the corresponding question. In a portfolio, “readiness is configured” needs a source version; “this flow ran” needs an environment, input and observed result.

## After startup

Health checks and restart policies have different roles. Docker describes restart policies in terms of containers stopping or exiting; a process that remains alive while readiness fails does not establish successful recovery. [Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/).

Likewise, `restart: true` inside `depends_on` concerns dependency updates or restarts explicitly performed by Compose. It should not be interpreted as continuous request routing or synchronization of every client. [Dependency restart semantics](https://docs.docker.com/reference/compose-file/services/#depends_on).

## A small experiment

A two-service fixture can isolate the concept: let an application listen for HTTP before it is ready, record the client's first request, then repeat while waiting for health. Finally, deliberately fail readiness while keeping the process alive and record what the client sees. This is an experiment design, not a HealthOS result.

What the source provides immediately is a better question. Separating **process**, **probe** and **business flow** makes the missing evidence visible before describing a system as ready.
