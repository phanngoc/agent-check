import { IsString, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  shippingAddress?: string;
}

