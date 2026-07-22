import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";
import { deepSerialize } from "../utils/serialize";

/** Serializes BigInt (Prisma ids/money) into JSON-safe numbers for every response. */
@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => deepSerialize(data)));
  }
}
